import prisma from "../db.server";
import { getRequestOrigin } from "../utils/request.server";
import { TYPE_LABELS } from "../utils/tournament-helpers";

/**
 * /j/CODE/calendar — the tournament as a calendar event (.ics), with a
 * reminder one day before. Phones open it straight in their calendar app.
 *
 * The event is written as an exact moment (UTC), so a phone's calendar shows
 * the same time as the Clubhouse pages do on that phone.
 */
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
// Calendar files wrap long lines at 75 bytes; continuation lines start with a space.
const fold = (line) => {
    const out = [];
    let rest = line;
    while (Buffer.byteLength(rest) > 74) {
        let cut = 74;
        while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
        out.push(rest.slice(0, cut));
        rest = " " + rest.slice(cut);
    }
    out.push(rest);
    return out.join("\r\n");
};

export const loader = async ({ params, request }) => {
    const code = params.code.toUpperCase();
    const t = await prisma.tournament.findUnique({ where: { joinCode: code }, include: { venue: true } });
    if (!t || !t.scheduledAt) throw new Response("No scheduled tournament with this code", { status: 404 });

    const origin = getRequestOrigin(request);
    const joinUrl = `${origin}/j/${t.joinCode}`;
    const start = new Date(t.scheduledAt);
    const end = new Date(start.getTime() + (t.duration || 90) * 60000);
    const venue = t.venue?.name || (t.location && !t.location.startsWith("http") ? t.location : "");
    const place = [venue, t.city || t.venue?.city].filter(Boolean).join(", ");
    const type = TYPE_LABELS[t.type] || t.type;
    const description = [
        `${t.maxPlayers ? `${t.maxPlayers} player ` : ""}${type} tournament`,
        t.price ? `Price: ${t.price} ${t.currency || ""}`.trim() : null,
        t.googleMapsUrl ? `Map: ${t.googleMapsUrl}` : null,
        `Join code: ${t.joinCode}`,
        joinUrl,
        "",
        "Powered by NOPA Padel · www.nopabrand.com",
    ].filter((l) => l !== null).join("\n");

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//NOPA Padel//Clubhouse//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${t.id}@nopa-clubhouse`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(`Padel: ${t.name}`)}`,
        place ? `LOCATION:${esc(place)}` : null,
        `DESCRIPTION:${esc(description)}`,
        `URL:${joinUrl}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(`Tomorrow: ${t.name}`)}`,
        "TRIGGER:-P1D",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean).map(fold).join("\r\n") + "\r\n";

    return new Response(lines, {
        headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="nopa-${t.joinCode}.ics"`,
            "Cache-Control": "no-cache",
        },
    });
};
