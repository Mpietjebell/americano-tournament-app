import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { registerPlayer } from "../utils/registration.server";

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

    const phone = (body.phone || "").trim();
    if (!phone || phone.length < 6) {
        return corsJson(request, { error: "Please enter a valid phone number.", code: "invalid_phone" }, { status: 400 });
    }

    // This endpoint is the public board: only public, scheduled, not-yet-started events.
    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        select: { isPublic: true, scheduledAt: true },
    });
    if (!tournament || !tournament.isPublic) {
        return corsJson(request, { error: "Tournament not found.", code: "not_found" }, { status: 404 });
    }
    if (!tournament.scheduledAt || tournament.scheduledAt <= new Date()) {
        return corsJson(
            request,
            { error: "This tournament is no longer accepting sign-ups.", code: "tournament_started" },
            { status: 409 }
        );
    }

    const result = await registerPlayer({ tournamentId: params.id, name: body.name, email: body.email, phone });
    if (!result.ok) {
        return corsJson(request, { error: result.error, code: result.code }, { status: result.status });
    }

    if (result.standby) {
        return corsJson(request, {
            ok: true,
            standby: true,
            position: result.position,
            message: `You're on standby — position ${result.position}. You'll be emailed if a spot opens!`,
        });
    }

    return corsJson(request, {
        ok: true,
        position: result.position,
        max: result.max,
        playerId: result.playerId,
        message: result.max
            ? `You're in — spot ${result.position} of ${result.max}. Check your email for confirmation!`
            : "You're in! Check your email for confirmation.",
    });
}

export async function loader({ request }) {
    return handleOptions(request) ?? corsJson(request, { error: "Method not allowed" }, { status: 405 });
}
