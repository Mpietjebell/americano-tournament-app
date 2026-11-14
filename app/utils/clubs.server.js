import prisma from "../db.server";
import { FORM_WINDOW, MIN_MATCHES } from "./scoring-rules";

export { FORM_WINDOW, MIN_MATCHES };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateClubCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        const taken = await prisma.club.findUnique({ where: { joinCode: code } });
        if (!taken) return code;
    }
    throw new Error("Could not generate a club code. Please try again.");
}

export const normaliseName = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");


const when = (t) => new Date(t.scheduledAt || t.createdAt).getTime();

function tally(tournaments) {
    const table = new Map();
    for (const t of tournaments) {
        const totals = new Map(t.players.map((p) => [p.id, { name: p.name, points: 0, against: 0, played: 0, won: 0 }]));
        for (const round of t.rounds) {
            for (const m of round.matches) {
                if (m.status !== "completed" || m.scoreA == null || m.scoreB == null) continue;
                const sides = [[JSON.parse(m.teamAIds), m.scoreA, m.scoreB], [JSON.parse(m.teamBIds), m.scoreB, m.scoreA]];
                for (const [ids, own, other] of sides) {
                    for (const id of ids) {
                        const row = totals.get(id);
                        if (!row) continue;
                        row.points += own;
                        row.against += other;
                        row.played += 1;
                        if (own > other) row.won += 1;
                    }
                }
            }
        }
        const rows = [...totals.values()].filter((r) => r.played > 0);
        const best = rows.reduce((max, r) => Math.max(max, r.points), 0);
        for (const r of rows) {
            const key = normaliseName(r.name);
            if (!key) continue;
            const entry = table.get(key) || { name: r.name.trim(), points: 0, against: 0, played: 0, won: 0, tournaments: 0, titles: 0 };
            entry.points += r.points;
            entry.against += r.against;
            entry.played += r.played;
            entry.won += r.won;
            entry.tournaments += 1;
            if (best > 0 && r.points === best) entry.titles += 1;
            table.set(key, entry);
        }
    }
    return [...table.values()].map((r) => ({
        ...r,
        // Share of all points played that this player's side won: 50 is an even record.
        share: r.points + r.against > 0 ? Math.round((r.points / (r.points + r.against)) * 1000) / 10 : 0,
    }));
}

/**
 * Club leaderboard, two ways.
 *
 * Players have no account — a Player row belongs to one tournament — so the
 * same person is recognised across tournaments by name. Only tournaments
 * whose host has released the results count, so the club table never
 * reveals an outcome the host is still holding back.
 *
 * `form` is the fair ranking: the share of points a player won per match
 * over the club's last FORM_WINDOW tournaments. It is an average, so turning
 * up more often does not by itself move you up, and old results roll off.
 * Players with fewer than MIN_MATCHES in the window are listed after the
 * ranked players as provisional — two lucky matches cannot top the table.
 *
 * `allTime` is the simple one: every point ever scored, added up. It rewards
 * showing up, which is what a "most active" table should do.
 */
export function buildClubLeaderboard(tournaments) {
    const finished = tournaments.filter((t) => t.status === "finished");
    const released = finished.filter((t) => t.resultsPublished).sort((a, b) => when(b) - when(a));

    const allTime = tally(released).sort((a, b) =>
        b.points - a.points || b.won - a.won || b.titles - a.titles || a.name.localeCompare(b.name));

    const byShare = (a, b) => b.share - a.share || b.won - a.won || b.points - a.points || a.name.localeCompare(b.name);
    const recent = tally(released.slice(0, FORM_WINDOW));
    const form = [
        ...recent.filter((r) => r.played >= MIN_MATCHES).sort(byShare).map((r) => ({ ...r, provisional: false })),
        ...recent.filter((r) => r.played < MIN_MATCHES).sort(byShare).map((r) => ({ ...r, provisional: true })),
    ];

    return {
        form,
        allTime,
        counted: released.length,
        inWindow: Math.min(released.length, FORM_WINDOW),
        awaitingRelease: finished.length - released.length,
    };
}
