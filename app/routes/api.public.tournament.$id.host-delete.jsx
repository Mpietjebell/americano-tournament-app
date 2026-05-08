import { json } from "@remix-run/node";
import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { sendCancellationEmail } from "../utils/email.server";

const MASTER_PASS = "NOPAMAIKELKEVIN1@";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;
    const { password } = await request.json();

    const t = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { participants: true },
    });
    if (!t) return corsJson(request, { ok: false, error: "Not found" }, { status: 404 });

    const isHost = password === MASTER_PASS || (t.hostPassword && t.hostPassword === password);
    if (!isHost) return corsJson(request, { ok: false, error: "Unauthorized" }, { status: 401 });

    // Notify participants
    const withEmail = t.participants.filter(p => p.email && p.standbyPosition == null);
    if (withEmail.length) {
        await sendCancellationEmail({ participants: withEmail, tournament: t }).catch(() => {});
    }

    await prisma.tournament.delete({ where: { id: params.id } });
    return corsJson(request, { ok: true });
}

export function loader({ request }) { return handleOptions(request) || json({}, 405); }
