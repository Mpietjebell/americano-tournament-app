import { json, redirect } from "@remix-run/node";
import prisma from "../db.server";
import { sendStandbyPromoted } from "../utils/email.server";
import { corsJson, handleOptions } from "../utils/cors.server";

export async function action({ request, params }) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const formData = await request.formData();
    const playerId = formData.get("playerId");

    if (!playerId) return json({ error: "Player ID required" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: {
            participants: { orderBy: { standbyPosition: "asc" } },
            venue: true,
        },
    });
    if (!tournament) return json({ error: "Tournament not found" }, { status: 404 });
    if (tournament.status !== "setup") {
        return json({ error: "Cannot deregister after the tournament has started." }, { status: 409 });
    }

    // Delete the player record (cascades participant cleanup if set, otherwise delete separately)
    try {
        await prisma.player.delete({ where: { id: playerId } });
    } catch {
        // Player may not exist - continue
    }

    // Delete participant record
    const participant = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId: params.id, playerId },
    });
    if (participant) {
        await prisma.tournamentParticipant.delete({ where: { id: participant.id } });
    }

    // Promote first standby if any
    const firstStandby = tournament.participants.find(
        p => p.standbyPosition != null && p.standbyPosition === 1 && p.playerId !== playerId
    );

    if (firstStandby) {
        // Create a real Player record for them
        const promotedPlayer = await prisma.player.create({
            data: { name: firstStandby.name, gender: "unspecified", tournamentId: params.id },
        });

        // Promote: clear standby position, link new player
        await prisma.tournamentParticipant.update({
            where: { id: firstStandby.id },
            data: { standbyPosition: null, playerId: promotedPlayer.id },
        });

        // Shift remaining standby positions down by 1
        await prisma.tournamentParticipant.updateMany({
            where: { tournamentId: params.id, standbyPosition: { gt: 1 } },
            data: { standbyPosition: { decrement: 1 } },
        });

        // Email the promoted player
        if (firstStandby.email) {
            sendStandbyPromoted({
                to: firstStandby.email,
                name: firstStandby.name,
                tournament,
            }).catch(() => {});
        }
    }

    // For cross-origin requests (from Shopify), return JSON instead of redirect
    const origin = request.headers.get("Origin") || "";
    const isCrossOrigin = origin.includes("nopabrand.com") || origin.includes("shopify");

    if (isCrossOrigin) {
        return corsJson(request, { ok: true, message: "You have been deregistered." });
    }

    // Clear player cookie and redirect to join page
    const cookieName = `nopa_player_${params.id}`;
    return redirect(`/app/play/join/${tournament.joinCode}`, {
        headers: {
            "Set-Cookie": `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`,
        },
    });
}

export async function loader({ request }) {
    return handleOptions(request) ?? json({ error: "POST only" }, { status: 405 });
}
