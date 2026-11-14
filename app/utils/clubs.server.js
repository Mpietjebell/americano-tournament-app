import prisma from "../db.server";

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

const normalise = (name) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Club leaderboard: every player's results added up across the club's
 * finished tournaments.
 *
 * Players have no account — a Player row belongs to one tournament — so the
 * same person is recognised across tournaments by name. Only tournaments
 * whose host has released the results count, so the club table never
 * reveals an outcome the host is still holding back.
 */
export function buildClubLeaderboard(tournaments) {
    const table = new Map();
    let counted = 0;
    let awaitingRelease = 0;

    for (const t of tournaments) {
        if (t.status !== "finished") continue;
        if (!t.resultsPublished) { awaitingRelease++; continue; }
        counted++;

        const totals = new Map(t.players.map((p) => [p.id, { name: p.name, points: 0, played: 0, won: 0 }]));
        for (const round of t.rounds) {
            for (const m of round.matches) {
                if (m.status !== "completed" || m.scoreA == null || m.scoreB == null) continue;
                const sides = [[JSON.parse(m.teamAIds), m.scoreA, m.scoreB], [JSON.parse(m.teamBIds), m.scoreB, m.scoreA]];
                for (const [ids, own, other] of sides) {
                    for (const id of ids) {
                        const row = totals.get(id);
                        if (!row) continue;
                        row.points += own;
                        row.played += 1;
                        if (own > other) row.won += 1;
                    }
                }
            }
        }

        const rows = [...totals.values()].filter((r) => r.played > 0);
        const best = rows.reduce((max, r) => Math.max(max, r.points), 0);
        for (const r of rows) {
            const key = normalise(r.name);
            if (!key) continue;
            const entry = table.get(key) || { name: r.name.trim(), points: 0, played: 0, won: 0, tournaments: 0, titles: 0 };
            entry.points += r.points;
            entry.played += r.played;
            entry.won += r.won;
            entry.tournaments += 1;
            if (best > 0 && r.points === best) entry.titles += 1;
            table.set(key, entry);
        }
    }

    const standings = [...table.values()].sort((a, b) =>
        b.points - a.points || b.won - a.won || b.titles - a.titles || a.name.localeCompare(b.name));
    return { standings, counted, awaitingRelease };
}
