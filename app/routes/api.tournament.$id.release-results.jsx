import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getHostTokenFromRequest } from "../utils/host-auth.server";

export async function action({ params, request }) {
    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return json({ error: "Not found" }, { status: 404 });

    const hostToken = getHostTokenFromRequest(request, params.id);
    if (!hostToken || hostToken !== tournament.hostToken) {
        return json({ error: "Host access required." }, { status: 403 });
    }

    await prisma.tournament.update({
        where: { id: params.id },
        data: { resultsPublished: true },
    });

    return json({ ok: true });
}
