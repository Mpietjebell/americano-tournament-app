import { json } from "@remix-run/node";
import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { generateAllRounds } from "../utils/tournament-actions.server";

const MASTER_PASS = "NOPAMAIKELKEVIN1@";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;
    const { password } = await request.json();

    const t = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { players: true, rounds: true, participants: true },
    });
    if (!t) return corsJson(request, { ok: false, error: "Not found" }, { status: 404 });

    const isMaster = password === MASTER_PASS;
    const isHost = isMaster || (t.hostPassword && t.hostPassword === password);
    if (!isHost) return corsJson(request, { ok: false, error: "Unauthorized" }, { status: 401 });

    if (t.rounds.length > 0) return corsJson(request, { ok: false, error: "Already started" }, { status: 400 });

    try {
        await generateAllRounds(t);
    } catch (err) {
        return corsJson(request, { ok: false, error: err.message }, { status: 400 });
    }
    await prisma.tournament.update({ where: { id: params.id }, data: { status: "active" } });

    return corsJson(request, { ok: true, redirectUrl: `https://americano-tournament-app-production.up.railway.app/app/play/tournament/${params.id}` });
}

export function loader({ request }) { return handleOptions(request) || json({}, 405); }
