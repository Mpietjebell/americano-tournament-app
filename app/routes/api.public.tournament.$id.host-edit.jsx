import { json } from "@remix-run/node";
import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";

const MASTER_PASS = "NOPAMAIKELKEVIN1@";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;
    const body = await request.json();
    const { password, scheduledAt, maxPlayers, price } = body;

    const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { hostPassword: true } });
    if (!t) return corsJson(request, { ok: false, error: "Not found" }, { status: 404 });

    const isHost = password === MASTER_PASS || (t.hostPassword && t.hostPassword === password);
    if (!isHost) return corsJson(request, { ok: false, error: "Unauthorized" }, { status: 401 });

    const update = {};
    if (scheduledAt !== undefined) update.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (maxPlayers !== undefined) update.maxPlayers = maxPlayers ? parseInt(maxPlayers) : null;
    if (price !== undefined) update.price = price ? parseFloat(price) : null;

    const updated = await prisma.tournament.update({ where: { id: params.id }, data: update });
    return corsJson(request, { ok: true, tournament: { scheduledAt: updated.scheduledAt, maxPlayers: updated.maxPlayers, price: updated.price } });
}

export function loader({ request }) { return handleOptions(request) || json({}, 405); }
