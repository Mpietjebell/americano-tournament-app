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
                status: "setup",
                scheduledAt: { gt: now },
            },
            include: {
                players: { select: { id: true } },
                participants: { select: { id: true } },
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

    const upcoming = withDistance(upcomingRaw)
        .filter((t) => t.maxPlayers == null || t.players.length < t.maxPlayers)
        .map(serialize);

    const recent = withDistance(recentRaw).map(serializeRecent);

    return corsJson(request, { upcoming, recent });
}

function serialize(t) {
    const winner = [...t.players].sort((a, b) => b.totalPoints - a.totalPoints)[0] ?? null;
    return {
        id: t.id,
        name: t.name,
        type: t.type,
        scheduledAt: t.scheduledAt,
        location: t.location,
        country: t.country,
        playerCount: t.players.length,
        maxPlayers: t.maxPlayers,
        distanceKm: t._dist,
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
        playerCount: t.players.length,
        distanceKm: t._dist,
        venue: t.venue
            ? { name: t.venue.name, city: t.venue.city, country: t.venue.country }
            : null,
        winner: sorted[0] ? { name: sorted[0].name, points: sorted[0].totalPoints } : null,
        status: t.status,
    };
}
