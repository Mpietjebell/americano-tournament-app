import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { sendSignupConfirmation, sendTournamentConfirmed } from "../utils/email.server";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;

    if (request.method !== "POST") {
        return corsJson(request, { error: "Method not allowed" }, { status: 405 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return corsJson(request, { error: "Invalid JSON" }, { status: 400 });
    }

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();

    if (!name || name.length < 2) {
        return corsJson(request, { error: "Please enter your full name.", code: "invalid_name" }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
        return corsJson(request, { error: "Please enter a valid email address.", code: "invalid_email" }, { status: 400 });
    }
    if (!phone || phone.length < 6) {
        return corsJson(request, { error: "Please enter a valid phone number.", code: "invalid_phone" }, { status: 400 });
    }

    const banned = await prisma.bannedSignup.findUnique({ where: { email } });
    if (banned) {
        return corsJson(
            request,
            { error: "This email address has been banned from signing up for NOPA tournaments.", code: "email_banned" },
            { status: 403 }
        );
    }

    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: {
            players: { select: { id: true } },
            participants: { select: { id: true, email: true, name: true, standbyPosition: true } },
            venue: true,
        },
    });

    if (!tournament || !tournament.isPublic) {
        return corsJson(request, { error: "Tournament not found.", code: "not_found" }, { status: 404 });
    }
    if (tournament.status !== "setup") {
        return corsJson(
            request,
            { error: "This tournament has already started.", code: "tournament_started" },
            { status: 409 }
        );
    }
    if (!tournament.scheduledAt || tournament.scheduledAt <= new Date()) {
        return corsJson(
            request,
            { error: "This tournament is no longer accepting sign-ups.", code: "tournament_started" },
            { status: 409 }
        );
    }

    const alreadySignedUp = tournament.participants.some((p) => p.email === email);
    if (alreadySignedUp) {
        return corsJson(
            request,
            { error: "This email address is already signed up for this tournament.", code: "already_signed_up" },
            { status: 409 }
        );
    }

    // Count active participants (standbyPosition is null = active slot)
    const activeParticipants = tournament.participants.filter(p => p.standbyPosition == null);
    const activeCount = activeParticipants.length;
    const isFull = tournament.maxPlayers != null && activeCount >= tournament.maxPlayers;

    if (isFull) {
        // Check if already on standby with this email
        const alreadyStandby = tournament.participants.some(p => p.email === email && p.standbyPosition != null);
        if (alreadyStandby) {
            return corsJson(request, { error: "You are already on the standby list.", code: "already_signed_up" }, { status: 409 });
        }

        // Get next standby position
        const standbyParticipants = tournament.participants.filter(p => p.standbyPosition != null);
        const maxPos = standbyParticipants.reduce((max, p) => Math.max(max, p.standbyPosition ?? 0), 0);
        const nextPosition = maxPos + 1;

        // Create player + standby participant in transaction
        const [standbyPlayer, standbyParticipant] = await prisma.$transaction([
            prisma.player.create({
                data: { name, gender: "unspecified", tournamentId: tournament.id },
            }),
            prisma.tournamentParticipant.create({
                data: { email, phone, name, tournamentId: tournament.id, standbyPosition: nextPosition },
            }),
        ]);

        // Link playerId to participant
        await prisma.tournamentParticipant.update({
            where: { id: standbyParticipant.id },
            data: { playerId: standbyPlayer.id },
        });

        // Send signup confirmation email noting standby status
        sendSignupConfirmation({ to: email, name, tournament, position: nextPosition }).catch(() => {});

        return corsJson(request, {
            ok: true,
            standby: true,
            position: nextPosition,
            message: `You're on standby — position ${nextPosition}. You'll be emailed if a spot opens!`,
        });
    }

    const currentCount = activeCount;
    let player, participant;
    try {
        [player, participant] = await prisma.$transaction([
            prisma.player.create({
                data: {
                    name,
                    gender: "unspecified",
                    tournamentId: tournament.id,
                },
            }),
            prisma.tournamentParticipant.create({
                data: {
                    email,
                    phone,
                    name,
                    tournamentId: tournament.id,
                },
            }),
        ]);
    } catch {
        return corsJson(request, { error: "Something went wrong. Please try again." }, { status: 500 });
    }

    // Link playerId now that we have it
    await prisma.tournamentParticipant.update({
        where: { id: participant.id },
        data: { playerId: player.id },
    });

    const position = tournament.players.length + currentCount + 1;

    // Send confirmation email (non-blocking)
    sendSignupConfirmation({ to: email, name, tournament, position }).catch(() => {});

    // If tournament just hit max, notify all participants
    if (tournament.maxPlayers && position >= tournament.maxPlayers) {
        const allParticipants = [...tournament.participants, { email, name }];
        sendTournamentConfirmed({ participants: allParticipants, tournament }).catch(() => {});
    }

    return corsJson(request, {
        ok: true,
        position,
        max: tournament.maxPlayers,
        playerId: player.id,
        message: tournament.maxPlayers
            ? `You're in — spot ${position} of ${tournament.maxPlayers}. Check your email for confirmation!`
            : "You're in! Check your email for confirmation.",
    });
}

export async function loader({ request }) {
    return handleOptions(request) ?? corsJson(request, { error: "Method not allowed" }, { status: 405 });
}
