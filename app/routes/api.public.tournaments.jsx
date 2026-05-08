import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { haversineKm } from "../utils/distance";

export async function loader({ request }) {
    const early = handleOptions(request);
    if (early) return early;

    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lng = parseFloat(url.searchParams.get("lng"));
    const hasCoords = !isNaN(lat) && !isNaN(lng);

    const now = new Date();

    const [upcomingRaw, recentRaw] = await Promise.all([
        prisma.tournament.findMany({
            where: {
                isPublic: true,
                status: { notIn: ["finished"] },
                scheduledAt: { gt: now },
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
                    { scheduledAt: { lt: new Date(now.getTime() - 86400000) } },
                ],
            },
            include: {
                players: {
                    select: { id: true, name: true, totalPoints: true },
                },
                venue: true,
            },
            orderBy: { scheduledAt: "desc" },
            take: 60,
        }),
    ]);

    function withDistance(list) {
        return list
            .map((t) => {
                const tLat = t.latitude ?? t.venue?.latitude;
                const tLng = t.longitude ?? t.venue?.longitude;
                const dist =
                    hasCoords && tLat != null && tLng != null
                        ? haversineKm(lat, lng, tLat, tLng)
                        : null;
                return { ...t, _dist: dist };
            })
            .sort((a, b) => {
                if (a._dist != null && b._dist != null) return a._dist - b._dist;
                if (a._dist != null) return -1;
                if (b._dist != null) return 1;
                return 0;
            })
            .slice(0, 30);
    }

    const upcoming = withDistance(upcomingRaw).map(serialize);

    const recent = withDistance(recentRaw).map(serializeRecent);

    return corsJson(request, { upcoming, recent });
}

function estimateDuration(t) {
    const players = t.maxPlayers || t.players.length;
    if (!players || !t.pointsPerMatch) return null;
    const minutesPerRound = t.pointsPerMatch * 0.5;
    const activeCourts = Math.min(t.courtsAvailable || 1, Math.floor(players / 4));
    const totalRounds = Math.max(0, players - 1);
    const total = totalRounds * minutesPerRound;
    if (!total) return null;
    const h = Math.floor(total / 60);
    const m = Math.round(total % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function serialize(t) {
    const activeParticipants = t.participants.filter(p => p.standbyPosition == null);
    const standbyParticipants = t.participants.filter(p => p.standbyPosition != null);
    // Fall back to players array if no participants yet (host-only tournament)
    const playerCount = t.participants.length > 0 ? activeParticipants.length : t.players.length;
    const standbyCount = standbyParticipants.length;
    const playerNames = t.participants.length > 0
        ? activeParticipants.map(p => p.name).filter(Boolean)
        : t.players.map(p => p.name);
    return {
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl || null,
        type: t.type,
        deuceMethod: t.deuceMethod,
        pointsPerMatch: t.pointsPerMatch,
        courtsAvailable: t.courtsAvailable,
        scheduledAt: t.scheduledAt,
        location: t.location,
        country: t.country,
        city: t.city || t.venue?.city || null,
        googleMapsUrl: t.googleMapsUrl || null,
        price: t.price ?? null,
        currency: t.currency || "EUR",
        playerCount,
        standbyCount,
        playerNames,
        maxPlayers: t.maxPlayers,
        maxStandby: t.maxStandby ?? null,
        joinCode: t.joinCode,
        durationEstimate: estimateDuration(t),
        distanceKm: t._dist,
        latitude: t.latitude ?? t.venue?.latitude ?? null,
        longitude: t.longitude ?? t.venue?.longitude ?? null,
        venue: t.venue
            ? {
                  name: t.venue.name,
                  city: t.venue.city,
                  country: t.venue.country,
                  latitude: t.venue.latitude,
                  longitude: t.venue.longitude,
              }
            : null,
        status: t.status,
    };
}

function serializeRecent(t) {
    const sorted = [...t.players].sort((a, b) => b.totalPoints - a.totalPoints);
    return {
        id: t.id,
        name: t.name,
        type: t.type,
        scheduledAt: t.scheduledAt,
        createdAt: t.createdAt,
        location: t.location,
        country: t.country,
        city: t.city || t.venue?.city || null,
        playerCount: t.players.length,
        distanceKm: t._dist,
        venue: t.venue
            ? { name: t.venue.name, city: t.venue.city, country: t.venue.country }
            : null,
        winner: sorted[0] ? { name: sorted[0].name, points: sorted[0].totalPoints } : null,
        status: t.status,
    };
}
