import { json } from "@remix-run/node";
import { search } from "../utils/photon.server";

export async function loader({ request }) {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) return json({ predictions: [] });
    try {
        const predictions = await search(q);
        return json({ predictions });
    } catch (err) {
        console.error("Photon search error:", err.message);
        return json({ predictions: [], error: err.message }, { status: 500 });
    }
}
