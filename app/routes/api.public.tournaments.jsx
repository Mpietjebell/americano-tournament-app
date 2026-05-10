import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";

export async function loader({ request }) {
    const early = handleOptions(request);
    if (early) return early;

    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [upcomingRaw, recentRaw] = await Promise.all([
        prisma.tournament.findMany({
            where: {
                isPublic: true,
                status: { notIn: ["finished"] },
                scheduledAt: { gt: now, lte: in14Days },
            },
            include: {
                players: { select: { id: true, name: true } },
                participants: { select: { id: true, name: true, standbyPosition: true } },
                venue: true,
            },
            orderBy: { scheduledAt: "asc" },
            take: 60,
        }),
        prisma.tournament.findMany({
            where: {
                isPublic: true,
                OR: [
                    { status: "finished" },
                    { scheduledAt: { lt: now } },
                ],
            },
            include: {
                players: { select: { id: true, name: true, totalPoints: true } },
                participants: { select: { id: true, standbyPosition: true } },
                venue: true,
            },
            orderBy: { scheduledAt: "desc" },
            take: 60,
        }),
    ]);

    const upcoming = upcomingRaw.map(t => serialize(t, false));
    const recent = recentRaw.map(t => serialize(t, true));

    // Unified list: upcoming first (soonest), then past (most recent first)
    const tournaments = [...upcoming, ...recent];

    return corsJson(request, { tournaments, upcoming, recent });
}

function serialize(t, past) {
    const activeParticipants = (t.participants || []).filter(p => p.standbyPosition == null);
    const standbyParticipants = (t.participants || []).filter(p => p.standbyPosition != null);
    const playerCount = t.players.length + activeParticipants.length;
    const standbyCount = standbyParticipants.length;
    const playerNames = [
        ...t.players.map(p => p.name),
        ...(t.participants || []).filter(p => p.standbyPosition == null).map(p => p.name),
    ].filter(Boolean);
    const sorted = past ? [...t.players].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)) : [];
    return {
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl || null,
        organizerName: t.organizerName || null,
        type: t.type,
        deuceMethod: t.deuceMethod,
        pointsPerMatch: t.pointsPerMatch,
        courtsAvailable: t.courtsAvailable,
        scheduledAt: t.scheduledAt,
        location: t.location,
        country: t.country,
        city: t.city || t.venue?.city || null,
        googleMapsUrl: t.googleMapsUrl || null,
        address: [t.city || t.venue?.city, t.country || t.venue?.country].filter(Boolean).join(", ") || null,
        price: t.price ?? null,
        currency: t.currency || "EUR",
        playerCount,
        standbyCount,
        playerNames,
        maxPlayers: t.maxPlayers,
        maxStandby: t.maxStandby ?? null,
        joinCode: t.joinCode,
        duration: t.duration || null,
        level: t.level || null,
        description: t.description || null,
        latitude: t.latitude ?? t.venue?.latitude ?? null,
        longitude: t.longitude ?? t.venue?.longitude ?? null,
        venue: t.venue ? { name: t.venue.name, city: t.venue.city, country: t.venue.country } : null,
        status: t.status,
        past,
        winner: past && sorted[0] ? { name: sorted[0].name, points: sorted[0].totalPoints } : null,
    };
}
