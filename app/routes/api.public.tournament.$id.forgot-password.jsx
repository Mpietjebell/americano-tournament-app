import { json } from "@remix-run/node";
import prisma from "../db.server";
import { corsJson, handleOptions } from "../utils/cors.server";
import { sendForgotPasswordEmail } from "../utils/email.server";

export async function action({ request, params }) {
    const early = handleOptions(request);
    if (early) return early;

    const t = await prisma.tournament.findUnique({
        where: { id: params.id },
        select: { name: true, hostEmail: true, hostPassword: true },
    });
    if (!t) return corsJson(request, { ok: false, error: "Not found" }, { status: 404 });
    if (!t.hostEmail) return corsJson(request, { ok: false, error: "No email registered for this tournament" });

    await sendForgotPasswordEmail({ to: t.hostEmail, tournament: t }).catch(() => {});
    return corsJson(request, { ok: true });
}

export function loader({ request }) { return handleOptions(request) || json({}, 405); }
