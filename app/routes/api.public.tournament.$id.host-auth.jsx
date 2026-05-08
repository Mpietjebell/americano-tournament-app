import { json } from "@remix-run/node";
import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";

const MASTER_USER = "NOPAMAIKELKEVIN";
const MASTER_PASS = "NOPAMAIKELKEVIN1@";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;
    const { password } = await request.json();
    if (!password) return corsJson(request, { ok: false, error: "Password required" }, { status: 400 });

    if (password === MASTER_PASS || password === MASTER_USER) {
        return corsJson(request, { ok: true, master: true });
    }

    const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { hostPassword: true, hostToken: true } });
    if (!t) return corsJson(request, { ok: false, error: "Tournament not found" }, { status: 404 });

    if (t.hostPassword && t.hostPassword === password) {
        return corsJson(request, { ok: true });
    }
    return corsJson(request, { ok: false, error: "Wrong password" }, { status: 401 });
}

export function loader({ request }) { return handleOptions(request) || json({}, 405); }
