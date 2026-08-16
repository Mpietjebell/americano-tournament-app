// One-off backfill: delete Round records that have zero Match rows.
//
// Root cause (fixed in app/utils/tournament-actions.server.js): generating
// rounds never checked the tournament's minimum player count. A scheduled
// public tournament starts with 0 sign-ups; if a host generated rounds
// before enough players had joined, getDefaultRounds() still planned
// rounds (players.length - 1), and each was created with zero courts —
// a round that is vacuously "Done" the instant it's created, with no
// matches and no score data behind it.
//
// This script finds any such empty rounds already sitting in the database,
// removes them, and puts the affected tournament back into a sane state
// (status/currentRound) so the host can generate again once enough
// players have joined.
//
// Usage:
//   node scripts/backfill-empty-rounds.mjs            # dry run — reports only
//   node scripts/backfill-empty-rounds.mjs --apply     # actually deletes/updates

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
    const emptyRounds = await prisma.round.findMany({
        where: { matches: { none: {} } },
        include: { tournament: { select: { id: true, name: true, status: true, currentRound: true } } },
    });

    if (emptyRounds.length === 0) {
        console.log("No empty rounds found. Nothing to do.");
        return;
    }

    console.log(`Found ${emptyRounds.length} empty round(s) across ${new Set(emptyRounds.map(r => r.tournamentId)).size} tournament(s):`);
    for (const r of emptyRounds) {
        console.log(`  - Round ${r.roundNumber} (status: ${r.status}) in "${r.tournament.name}" [${r.tournamentId}]`);
    }

    if (!apply) {
        console.log("\nDry run only — no changes made. Re-run with --apply to fix these.");
        return;
    }

    const affectedTournamentIds = [...new Set(emptyRounds.map(r => r.tournamentId))];

    await prisma.round.deleteMany({
        where: { id: { in: emptyRounds.map(r => r.id) } },
    });
    console.log(`\nDeleted ${emptyRounds.length} empty round(s).`);

    for (const tournamentId of affectedTournamentIds) {
        const remainingRounds = await prisma.round.findMany({
            where: { tournamentId },
            orderBy: { roundNumber: "asc" },
            include: { matches: true },
        });

        if (remainingRounds.length === 0) {
            // Nothing legitimate was ever generated — back to setup so the
            // host can try again once enough players have joined.
            await prisma.tournament.update({
                where: { id: tournamentId },
                data: { status: "setup", currentRound: 0 },
            });
            console.log(`  Reset tournament ${tournamentId} to status "setup".`);
            continue;
        }

        const firstIncomplete = remainingRounds.find(r => r.status !== "completed");
        await prisma.tournament.update({
            where: { id: tournamentId },
            data: {
                currentRound: firstIncomplete ? firstIncomplete.roundNumber : remainingRounds.length,
                status: firstIncomplete ? "active" : "finished",
            },
        });
        console.log(`  Updated tournament ${tournamentId} — currentRound/status recalculated from ${remainingRounds.length} remaining round(s).`);
    }

    console.log("\nDone.");
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
