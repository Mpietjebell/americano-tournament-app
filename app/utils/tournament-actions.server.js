/**
 * Server-side actions for the public tournament view.
 * Separated to avoid leaking .server imports into the client bundle.
 */
import prisma from "../db.server";
import {
    generateAmericanoRound,
    generateMexicanoRound,
    generateKingOfTheCourtRound,
    generateNextKingOfTheCourtRound,
    generateTeamAmericanoRound,
    generateTeamMexicanoRound,
    processMatchScore,
} from "../utils/tournament-engine.server";
import { buildTeams, getDefaultRounds, getMinimumPlayers, isDynamicFormat } from "./tournament-helpers";

export async function loadTournament(id) {
    const tournament = await prisma.tournament.findUnique({
        where: { id },
        include: {
            players: {
                orderBy: [
                    { teamId: "asc" },
                    { name: "asc" },
                ],
            },
            rounds: {
                include: { matches: true },
                orderBy: { roundNumber: "asc" },
            },
            venue: true,
            participants: { select: { email: true, name: true } },
        },
    });

    if (!tournament) return null;

    const setupPlayers = tournament.players.map((player) => ({ ...player }));
    const computedPlayers = tournament.players.map((player) => ({
        ...player,
        totalPoints: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesDrawn: 0,
    }));
    const playerMap = new Map(computedPlayers.map((player) => [player.id, player]));

    for (const round of tournament.rounds) {
        for (const match of round.matches) {
            if (match.status !== "completed" || match.scoreA == null || match.scoreB == null) continue;

            const teamAIds = JSON.parse(match.teamAIds);
            const teamBIds = JSON.parse(match.teamBIds);
            const isDraw = match.scoreA === match.scoreB;

            for (const playerId of teamAIds) {
                const player = playerMap.get(playerId);
                if (!player) continue;
                player.totalPoints += match.scoreA;
                player.matchesPlayed += 1;
                if (match.scoreA > match.scoreB) player.matchesWon += 1;
                if (isDraw) player.matchesDrawn += 1;
            }

            for (const playerId of teamBIds) {
                const player = playerMap.get(playerId);
                if (!player) continue;
                player.totalPoints += match.scoreB;
                player.matchesPlayed += 1;
                if (match.scoreB > match.scoreA) player.matchesWon += 1;
                if (isDraw) player.matchesDrawn += 1;
            }
        }
    }

    computedPlayers.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        if (b.matchesDrawn !== a.matchesDrawn) return b.matchesDrawn - a.matchesDrawn;
        if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
        return a.name.localeCompare(b.name);
    });

    return {
        ...tournament,
        setupPlayers,
        players: computedPlayers,
    };
}

function getTeamEntries(players) {
    return buildTeams(players)
        .filter((team) => team.players.length > 0)
        .map((team) => ({
            teamId: team.id,
            label: team.label,
            playerIds: team.players.map((player) => player.id),
            totalPoints: team.players.reduce((sum, player) => sum + (player.totalPoints || 0), 0),
        }));
}

async function createRound(tournamentId, roundNumber, result) {
    return prisma.round.create({
        data: {
            roundNumber,
            status: "pending",
            tournamentId,
            matches: {
                create: result.courts.map((court) => ({
                    court: court.court,
                    teamAIds: JSON.stringify(court.teamA),
                    teamBIds: JSON.stringify(court.teamB),
                })),
            },
        },
        include: { matches: true },
    });
}

function buildKingOfTheCourtChallengers(completedRound, currentQueue = []) {
    const lowestCourt = [...completedRound.matches].sort((a, b) => b.court - a.court)[0];
    const lowestLosers = [];
    if (lowestCourt) {
        const losingIds = lowestCourt.scoreA > lowestCourt.scoreB ? JSON.parse(lowestCourt.teamBIds) : lowestCourt.scoreB > lowestCourt.scoreA ? JSON.parse(lowestCourt.teamAIds) : [];
        lowestLosers.push(...losingIds);
    }

    return [...new Set([...currentQueue, ...lowestLosers])];
}

function getInactivePlayers(players, result) {
    const activeIds = new Set();
    for (const court of result.courts) {
        court.teamA.forEach((id) => activeIds.add(id));
        court.teamB.forEach((id) => activeIds.add(id));
    }

    return players.filter((player) => !activeIds.has(player.id)).map((player) => player.id);
}

async function buildNextDynamicRound(tournament, roundNumber, completedRound, freshPlayers, currentKingQueue = []) {
    const players = freshPlayers;
    const numCourts = tournament.courtsAvailable;

    if (tournament.type === "mexicano") {
        return generateMexicanoRound(players, numCourts, { randomizeFirstRound: roundNumber === 1 });
    }

    if (tournament.type === "team_mexicano") {
        const teams = getTeamEntries(players);
        if (teams.some((team) => team.playerIds.length !== 2)) {
            throw new Error("Each Team Mexicano team must have exactly two players before generating rounds.");
        }

        return generateTeamMexicanoRound(teams, Math.min(numCourts, Math.floor(teams.length / 2)), {
            randomizeFirstRound: roundNumber === 1,
        });
    }

    if (tournament.type === "king_of_the_court") {
        if (roundNumber === 1 || !completedRound) {
            return generateKingOfTheCourtRound(players, Math.min(numCourts, Math.floor(players.length / 4)));
        }

        return generateNextKingOfTheCourtRound(
            [...completedRound.matches].sort((a, b) => a.court - b.court),
            players,
            Math.min(numCourts, Math.floor(players.length / 4)),
            {
                challengerPlayerIds: buildKingOfTheCourtChallengers(completedRound, currentKingQueue),
            },
        );
    }

    return null;
}

export async function generateAllRounds(tournament) {
    const players = tournament.setupPlayers || tournament.players;
    const numCourts = tournament.courtsAvailable;

    // Scheduled public tournaments start with 0 sign-ups and only get
    // players over time — a host can hit "Generate All Rounds" before
    // enough people have joined. Without this guard, getDefaultRounds()
    // still plans rounds (e.g. players.length - 1), and each one gets
    // created with zero courts/matches: a round that's technically
    // "complete" the instant it's created, with nothing in it.
    const minPlayers = getMinimumPlayers(tournament.type);
    if (players.length < minPlayers) {
        throw new Error(`This format needs at least ${minPlayers} players to generate rounds — there ${players.length === 1 ? "is" : "are"} currently ${players.length}.`);
    }
    if ((tournament.type === "team_americano" || tournament.type === "team_mexicano") && players.length % 2 !== 0) {
        throw new Error("Fixed-team formats need an even number of players to generate rounds.");
    }

    const plannedRounds = getDefaultRounds(tournament.type, players, buildTeams(players));

    if (isDynamicFormat(tournament.type)) {
        const firstRound = await buildNextDynamicRound(tournament, 1, null, players, []);
        await createRound(tournament.id, 1, firstRound);

        await prisma.tournament.update({
            where: { id: tournament.id },
            data: {
                currentRound: 1,
                status: plannedRounds > 0 ? "active" : "finished",
                kingQueueState: tournament.type === "king_of_the_court" ? JSON.stringify(getInactivePlayers(players, firstRound)) : null,
            },
        });

        return;
    }

    if (tournament.type === "team_americano") {
        const teams = getTeamEntries(players);

        if (teams.some((team) => team.playerIds.length !== 2)) {
            throw new Error("Each Team Americano team must have exactly two players before generating rounds.");
        }

        const totalRounds = getDefaultRounds(tournament.type, players, buildTeams(players));
        const activeCourts = Math.min(numCourts, Math.floor(teams.length / 2));

        for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
            const existingRounds = await prisma.round.findMany({
                where: { tournamentId: tournament.id },
                include: { matches: true },
            });

            const previousOpponents = new Map();
            for (const team of teams) previousOpponents.set(team.teamId, new Set());
            for (const round of existingRounds) {
                for (const match of round.matches) {
                    const teamAIds = JSON.parse(match.teamAIds);
                    const teamBIds = JSON.parse(match.teamBIds);
                    const teamA = teams.find((team) => team.playerIds.every((id) => teamAIds.includes(id)));
                    const teamB = teams.find((team) => team.playerIds.every((id) => teamBIds.includes(id)));
                    if (!teamA || !teamB) continue;
                    previousOpponents.get(teamA.teamId)?.add(teamB.teamId);
                    previousOpponents.get(teamB.teamId)?.add(teamA.teamId);
                }
            }

            const result = generateTeamAmericanoRound(teams, roundNum, previousOpponents, activeCourts);

            await createRound(tournament.id, roundNum, result);
        }

        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { currentRound: 1, status: "active" },
        });

        return;
    }

    const totalRounds = plannedRounds;

    for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
        const existingRounds = await prisma.round.findMany({
            where: { tournamentId: tournament.id },
            include: { matches: true },
        });

        let result;

        if (tournament.type === "americano" || tournament.type === "beat_the_box") {
            const prevPartners = new Map();
            for (const p of players) prevPartners.set(p.id, new Set());
            for (const round of existingRounds) {
                for (const match of round.matches) {
                    const teamA = JSON.parse(match.teamAIds);
                    const teamB = JSON.parse(match.teamBIds);
                    if (teamA.length === 2) { prevPartners.get(teamA[0])?.add(teamA[1]); prevPartners.get(teamA[1])?.add(teamA[0]); }
                    if (teamB.length === 2) { prevPartners.get(teamB[0])?.add(teamB[1]); prevPartners.get(teamB[1])?.add(teamB[0]); }
                }
            }
            result = generateAmericanoRound(players, roundNum, prevPartners, numCourts);
        } else if (tournament.type === "mexicano") {
            result = generateMexicanoRound(players, numCourts, { randomizeFirstRound: roundNum === 1 });
        } else {
            const prevPartners = new Map();
            for (const p of players) prevPartners.set(p.id, new Set());
            result = generateAmericanoRound(players, roundNum, prevPartners, numCourts);
        }

        await createRound(tournament.id, roundNum, result);
    }

    await prisma.tournament.update({
        where: { id: tournament.id },
        data: { currentRound: 1, status: "active" },
    });
}

export async function submitScore(tournament, matchId, scoreA, scoreB) {
    if (isNaN(scoreA) || isNaN(scoreB)) return { error: "Please enter valid scores." };

    if (scoreA + scoreB !== tournament.pointsPerMatch) {
        return { error: `Scores must add up to ${tournament.pointsPerMatch}.` };
    }

    const match = await prisma.match.update({
        where: { id: matchId },
        data: { scoreA, scoreB, status: "completed", proposedScoreA: null, proposedScoreB: null },
    });

    const freshPlayers = await prisma.player.findMany({
        where: { tournamentId: tournament.id },
    });

    const updates = processMatchScore(match, freshPlayers);
    for (const u of updates) {
        await prisma.player.update({
            where: { id: u.id },
            data: {
                totalPoints: u.totalPoints,
                matchesPlayed: u.matchesPlayed,
                matchesWon: u.matchesWon,
                matchesDrawn: u.matchesDrawn,
            },
        });
    }

    let matchRound = await prisma.round.findFirst({
        where: { matches: { some: { id: matchId } } },
        include: { matches: true },
    });
    if (matchRound) {
        const allMatchesDone = matchRound.matches.every((m) => m.id === matchId ? true : m.status === "completed");
        if (allMatchesDone) {
            matchRound = await prisma.round.update({ where: { id: matchRound.id }, data: { status: "completed" }, include: { matches: true } });
        } else if (matchRound.status === "pending") {
            matchRound = await prisma.round.update({ where: { id: matchRound.id }, data: { status: "active" }, include: { matches: true } });
        }
    }

    let allRounds = await prisma.round.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { roundNumber: "asc" },
        include: { matches: true },
    });

    const playersForPlanning = freshPlayers.map((player) => {
        const update = updates.find((entry) => entry.id === player.id);
        return update ? { ...player, ...update } : player;
    });
    const plannedRounds = getDefaultRounds(tournament.type, playersForPlanning, buildTeams(playersForPlanning));
    const latestRound = allRounds[allRounds.length - 1];
    const lastRoundCompleted = latestRound && latestRound.status === "completed";
    const currentKingQueue = tournament.kingQueueState ? JSON.parse(tournament.kingQueueState) : [];

    if (isDynamicFormat(tournament.type) && lastRoundCompleted && allRounds.length < plannedRounds) {
        const nextRoundNumber = allRounds.length + 1;
        const result = await buildNextDynamicRound(tournament, nextRoundNumber, latestRound, playersForPlanning, currentKingQueue);
        await createRound(tournament.id, nextRoundNumber, result);
        if (tournament.type === "king_of_the_court") {
            await prisma.tournament.update({
                where: { id: tournament.id },
                data: {
                    kingQueueState: JSON.stringify(getInactivePlayers(playersForPlanning, result)),
                },
            });
        }
        allRounds = await prisma.round.findMany({
            where: { tournamentId: tournament.id },
            orderBy: { roundNumber: "asc" },
            include: { matches: true },
        });
    }

    const firstIncomplete = allRounds.find((round) => round.status !== "completed");
    if (firstIncomplete) {
        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { currentRound: firstIncomplete.roundNumber, status: "active" },
        });
    } else {
        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { status: "finished", currentRound: allRounds.length },
        });
    }

    return { success: true };
}

export async function proposeScore(tournament, matchId, scoreA, scoreB) {
    if (isNaN(scoreA) || isNaN(scoreB)) return { error: "Please enter valid scores." };
    if (scoreA + scoreB !== tournament.pointsPerMatch) {
        return { error: `Scores must add up to ${tournament.pointsPerMatch}.` };
    }
    if (scoreA < 0 || scoreB < 0 || scoreA > tournament.pointsPerMatch || scoreB > tournament.pointsPerMatch) {
        return { error: "Scores must be between 0 and the total points." };
    }

    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { round: true } });
    if (!match || match.round.tournamentId !== tournament.id) return { error: "Match not found." };
    if (match.status === "completed") return { error: "This match is already completed." };

    await prisma.match.update({
        where: { id: matchId },
        data: { proposedScoreA: scoreA, proposedScoreB: scoreB },
    });

    return { success: true };
}

export async function confirmScore(tournament, matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { round: true } });
    if (!match || match.round.tournamentId !== tournament.id) return { error: "Match not found." };
    if (match.proposedScoreA == null || match.proposedScoreB == null) {
        return { error: "No proposed score to confirm." };
    }

    const result = await submitScore(tournament, matchId, match.proposedScoreA, match.proposedScoreB);
    if (result.error) return result;

    return { success: true };
}

export async function resetScore(tournament, matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId }, include: { round: true } });
    if (!match || match.round.tournamentId !== tournament.id) return { error: "Match not found." };

    await prisma.match.update({
        where: { id: matchId },
        data: {
            scoreA: null,
            scoreB: null,
            proposedScoreA: null,
            proposedScoreB: null,
            status: "pending",
        },
    });

    const matchRound = await prisma.round.findFirst({
        where: { matches: { some: { id: matchId } } },
        include: { matches: true },
    });
    if (matchRound && matchRound.status === "completed") {
        await prisma.round.update({
            where: { id: matchRound.id },
            data: { status: "active" },
        });
    }

    const dynamicFormats = ["mexicano", "team_mexicano", "king_of_the_court"];
    if (dynamicFormats.includes(tournament.type) && matchRound) {
        await prisma.round.deleteMany({
            where: {
                tournamentId: tournament.id,
                roundNumber: { gt: matchRound.roundNumber },
            },
        });
        if (tournament.type === "king_of_the_court") {
            await prisma.tournament.update({
                where: { id: tournament.id },
                data: { kingQueueState: null },
            });
        }
    }

    // Fetch all rounds once with orderBy for reuse in stats recalculation and finding first incomplete
    const allRounds = await prisma.round.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { roundNumber: "asc" },
        include: { matches: true },
    });

    const players = await prisma.player.findMany({
        where: { tournamentId: tournament.id },
    });

    const playerMap = new Map(players.map((p) => [p.id, {
        id: p.id,
        totalPoints: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesDrawn: 0,
    }]));

    for (const round of allRounds) {
        for (const match of round.matches) {
            if (match.id === matchId) continue;
            if (match.status !== "completed" || match.scoreA == null || match.scoreB == null) continue;
            const teamAIds = JSON.parse(match.teamAIds);
            const teamBIds = JSON.parse(match.teamBIds);
            const isDraw = match.scoreA === match.scoreB;
            for (const playerId of teamAIds) {
                const p = playerMap.get(playerId);
                if (!p) continue;
                p.totalPoints += match.scoreA;
                p.matchesPlayed += 1;
                if (match.scoreA > match.scoreB) p.matchesWon += 1;
                if (isDraw) p.matchesDrawn += 1;
            }
            for (const playerId of teamBIds) {
                const p = playerMap.get(playerId);
                if (!p) continue;
                p.totalPoints += match.scoreB;
                p.matchesPlayed += 1;
                if (match.scoreB > match.scoreA) p.matchesWon += 1;
                if (isDraw) p.matchesDrawn += 1;
            }
        }
    }

    // Wrap player updates in a transaction
    await prisma.$transaction(
        [...playerMap.values()].map((stats) =>
            prisma.player.update({
                where: { id: stats.id },
                data: {
                    totalPoints: stats.totalPoints,
                    matchesPlayed: stats.matchesPlayed,
                    matchesWon: stats.matchesWon,
                    matchesDrawn: stats.matchesDrawn,
                },
            })
        )
    );

    const firstIncomplete = allRounds.find((r) => r.status !== "completed");
    if (firstIncomplete) {
        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { currentRound: firstIncomplete.roundNumber, status: "active" },
        });
    }

    return { success: true };
}
