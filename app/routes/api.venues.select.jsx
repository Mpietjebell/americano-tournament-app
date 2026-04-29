import { json } from "@remix-run/node";
import prisma from "../db.server";

export async function action({ request }) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { osmId, name, address, city, country, latitude, longitude } = body;
    if (!osmId || latitude == null || longitude == null) {
        return json({ error: "osmId, latitude and longitude are required" }, { status: 400 });
    }

    // Return cached venue or create new one
    const existing = await prisma.venue.findUnique({ where: { osmId } });
    if (existing) return json({ venue: existing });

    const venue = await prisma.venue.create({
        data: { osmId, name: name || osmId, address: address || "", city, country, latitude, longitude },
    });
    return json({ venue });
}

export async function loader() {
    return json({ error: "POST only" }, { status: 405 });
}
