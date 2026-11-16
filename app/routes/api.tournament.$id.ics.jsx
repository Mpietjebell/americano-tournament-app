import prisma from "../db.server";
import { getRequestOrigin } from "../utils/request.server";

function fmtIcs(d) {
    // wall-clock time at the venue: written without "Z" so calendars keep the hour
    return d.toISOString().replace(/[-:]/g, "").split(".")[0];
}

export async function loader({ params, request }) {
    const t = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { venue: true },
    });
    if (!t || !t.scheduledAt) return new Response("Not found", { status: 404 });

    const start = new Date(t.scheduledAt);
    const end = new Date(start.getTime() + (t.duration || 120) * 60000);
    const venueName = t.venue?.name || (t.location && !t.location.startsWith("http") ? t.location : "") || "";
    const city = t.city || t.venue?.city || "";
    const location = [venueName, city].filter(Boolean).join(", ");
    const url = `${getRequestOrigin(request)}/j/${t.joinCode}`;

    const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//NOPA Padel//Tournament//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${t.id}@nopabrand.com`,
        `DTSTART:${fmtIcs(start)}`,
        `DTEND:${fmtIcs(end)}`,
        `SUMMARY:${t.name}`,
        location ? `LOCATION:${location}` : null,
        `DESCRIPTION:NOPA Padel Tournament — ${url}`,
        `URL:${url}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    return new Response(ics, {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `attachment; filename="${t.name.replace(/[^a-z0-9]/gi, "-")}.ics"`,
            "Cache-Control": "no-store",
        },
    });
}
