/**
 * NOPA Padel Tournament Engine
 * 
 * Contains pairing algorithms for the NOPA game types.
 */

// ─── HELPERS ────────────────────────────────────────────

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Given an array of players sorted by rank, groups them into courts of 4.
 * Court 1: indices 0,1,2,3 → Team A = [0,3], Team B = [1,2]  (cross-pairing)
 * Court 2: indices 4,5,6,7 → Team A = [4,7], Team B = [5,6]
 * Returns { courts: [...], bye: [...] }
 */
function groupIntoCourts(sortedPlayers, numCourts) {
    const activePlayers = sortedPlayers.slice(0, numCourts * 4);
    const byePlayers = sortedPlayers.slice(numCourts * 4);

    const courts = [];
    for (let c = 0; c < numCourts && c * 4 + 3 < activePlayers.length; c++) {
        const base = c * 4;
        courts.push({
            court: c + 1,
            teamA: [activePlayers[base].id, activePlayers[base + 3].id],
            teamB: [activePlayers[base + 1].id, activePlayers[base + 2].id],
        });
    }

    return { courts, byePlayerIds: byePlayers.map(p => p.id) };
}

// ─── AMERICANO ──────────────────────────────────────────

/**
 * Round-robin partner rotation.
 * Each round, shuffle players and assign to courts.
 * Track previous partners to avoid repeat pairings until exhausted.
 */
export function generateAmericanoRound(players, roundNumber, previousPartners, numCourts) {
    // previousPartners: Map<playerId, Set<partnerId>>
    let bestArrangement = null;
    let bestScore = -1;

    // Try multiple random shuffles and pick the one with fewest repeated partners
    for (let attempt = 0; attempt < 50; attempt++) {
        const shuffled = shuffle(players);
        const { courts, byePlayerIds } = groupIntoCourts(shuffled, numCourts);

        let novelty = 0;
        for (const court of courts) {
            // Check Team A partners
            const [a1, a2] = court.teamA;
            if (!previousPartners.get(a1)?.has(a2)) novelty++;
            // Check Team B partners
            const [b1, b2] = court.teamB;
            if (!previousPartners.get(b1)?.has(b2)) novelty++;
        }

        if (novelty > bestScore) {
            bestScore = novelty;
            bestArrangement = { courts, byePlayerIds };
            if (novelty === courts.length * 2) break; // Perfect — all new partners
        }
    }

    return bestArrangement;
}

// ─── MEXICANO ───────────────────────────────────────────

/**
 * Swiss System: sort players by totalPoints DESC.
 * Group top 4 on Court 1 (Rank 1&4 vs 2&3), next 4 on Court 2, etc.
 */
export function generateMexicanoRound(players, numCourts, options = {}) {
    const sorted = options.randomizeFirstRound
        ? shuffle(players)
        : [...players].sort((a, b) => b.totalPoints - a.totalPoints);
    return groupIntoCourts(sorted, numCourts);
}

// ─── TEAM AMERICANO ─────────────────────────────────────

/**
 * Fixed partners. Teams rotate opponents in round-robin.
 * teams: array of { teamId, playerIds: [id1, id2], totalPoints }
 */
export function generateTeamAmericanoRound(teams, roundNumber, previousOpponents, numCourts) {
    let bestArrangement = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < 50; attempt++) {
        const shuffled = shuffle(teams);
        const courts = [];
        const byeTeamIds = [];

        for (let c = 0; c < numCourts && c * 2 + 1 < shuffled.length; c++) {
            courts.push({
                court: c + 1,
                teamA: shuffled[c * 2].playerIds,
                teamB: shuffled[c * 2 + 1].playerIds,
                teamAId: shuffled[c * 2].teamId,
                teamBId: shuffled[c * 2 + 1].teamId,
            });
        }

        for (let i = numCourts * 2; i < shuffled.length; i++) {
            byeTeamIds.push(shuffled[i].teamId);
        }

        // Score novelty of opponent matchups
        let novelty = 0;
        for (const court of courts) {
            if (!previousOpponents.get(court.teamAId)?.has(court.teamBId)) novelty++;
        }

        if (novelty > bestScore) {
            bestScore = novelty;
            bestArrangement = { courts, byeTeamIds };
            if (novelty === courts.length) break;
        }
    }

    return bestArrangement;
}

// ─── TEAM MEXICANO ──────────────────────────────────────

export function generateTeamMexicanoRound(teams, numCourts, options = {}) {
    const orderedTeams = options.randomizeFirstRound
        ? shuffle(teams)
        : [...teams].sort((a, b) => b.totalPoints - a.totalPoints);

    const activeTeams = orderedTeams.slice(0, numCourts * 2);
    const byeTeamIds = orderedTeams.slice(numCourts * 2).map((team) => team.teamId);
    const courts = [];

    for (let courtIndex = 0; courtIndex < numCourts && courtIndex * 2 + 1 < activeTeams.length; courtIndex++) {
        const teamA = activeTeams[courtIndex * 2];
        const teamB = activeTeams[courtIndex * 2 + 1];
        courts.push({
            court: courtIndex + 1,
            teamA: teamA.playerIds,
            teamB: teamB.playerIds,
            teamAId: teamA.teamId,
            teamBId: teamB.teamId,
        });
    }

    return { courts, byeTeamIds };
}

// ─── KING OF THE COURT ──────────────────────────────────

function randomizeCourtPlayers(playerIds) {
    const ordered = shuffle(playerIds);
    return {
        teamA: [ordered[0], ordered[3]],
        teamB: [ordered[1], ordered[2]],
    };
}

export function generateKingOfTheCourtRound(players, numCourts) {
    const shuffled = shuffle(players);
    const activePlayers = shuffled.slice(0, numCourts * 4);
    const byePlayerIds = shuffled.slice(numCourts * 4).map((player) => player.id);
    const courts = [];

    for (let courtIndex = 0; courtIndex < numCourts && courtIndex * 4 + 3 < activePlayers.length; courtIndex++) {
        const courtPlayers = activePlayers.slice(courtIndex * 4, courtIndex * 4 + 4).map((player) => player.id);
        const { teamA, teamB } = randomizeCourtPlayers(courtPlayers);
        courts.push({
            court: courtIndex + 1,
            teamA,
            teamB,
            courtPlayers,
        });
    }

    return { courts, byePlayerIds };
}

export function generateNextKingOfTheCourtRound(roundMatches, allPlayers, numCourts, options = {}) {
    const activeCourts = Math.min(numCourts, roundMatches.length);
    const assignments = new Map(Array.from({ length: activeCourts }, (_, index) => [index + 1, []]));
    const challengerQueue = [...(options.challengerPlayerIds || [])];

    for (const match of roundMatches) {
        const teamAIds = JSON.parse(match.teamAIds);
        const teamBIds = JSON.parse(match.teamBIds);

        if (match.scoreA === match.scoreB) {
            assignments.get(match.court)?.push(...teamAIds, ...teamBIds);
            continue;
        }

        const winners = match.scoreA > match.scoreB ? teamAIds : teamBIds;
        const losers = match.scoreA > match.scoreB ? teamBIds : teamAIds;
        const upCourt = Math.max(1, match.court - 1);
        const downCourt = Math.min(activeCourts, match.court + 1);

        assignments.get(upCourt)?.push(...winners);
        assignments.get(downCourt)?.push(...losers);
    }

    const availablePlayers = new Set(allPlayers.map((player) => player.id));
    const courts = [];
    const assignedPlayerIds = new Set();

    for (let court = 1; court <= activeCourts; court++) {
        const rawPlayerIds = assignments.get(court) || [];
        const uniquePlayerIds = [...new Set(rawPlayerIds)].filter((playerId) => availablePlayers.has(playerId));
        const courtPlayers = uniquePlayerIds.slice(0, 4);

        if (courtPlayers.length < 4) {
            const challengerFillers = challengerQueue.filter((playerId) => !assignedPlayerIds.has(playerId) && !courtPlayers.includes(playerId));
            courtPlayers.push(...challengerFillers.slice(0, 4 - courtPlayers.length));
        }

        if (courtPlayers.length < 4) {
            const fillers = allPlayers
                .filter((player) => !assignedPlayerIds.has(player.id) && !courtPlayers.includes(player.id) && !challengerQueue.includes(player.id))
                .slice(0, 4 - courtPlayers.length)
                .map((player) => player.id);
            courtPlayers.push(...fillers);
        }

        if (courtPlayers.length < 4) continue;

        courtPlayers.forEach((playerId) => assignedPlayerIds.add(playerId));
        const { teamA, teamB } = randomizeCourtPlayers(courtPlayers);
        courts.push({
            court,
            teamA,
            teamB,
            courtPlayers,
        });
    }

    const byePlayerIds = allPlayers
        .filter((player) => !assignedPlayerIds.has(player.id))
        .map((player) => player.id);

    return { courts, byePlayerIds };
}

// ─── BEAT THE BOX ───────────────────────────────────────

/**
 * Winner stays / moves up, loser moves down.
 * courtAssignments: array of { court, teamA: [id,id], teamB: [id,id] }
 * results: array of { court, winnerTeam: 'A'|'B' }
 */
export function generateBeatTheBoxNextRound(courtAssignments, results, waitingPairs) {
    const numCourts = courtAssignments.length;
    const newCourts = new Array(numCourts).fill(null).map((_, i) => ({ court: i + 1, teamA: null, teamB: null }));

    // Determine winners and losers per court
    const movers = []; // { pair, direction: 'up'|'down'|'stay', fromCourt }
    for (const result of results) {
        const assignment = courtAssignments.find(c => c.court === result.court);
        const winner = result.winnerTeam === "A" ? assignment.teamA : assignment.teamB;
        const loser = result.winnerTeam === "A" ? assignment.teamB : assignment.teamA;

        if (result.court === 1) {
            // Top court: winner stays
            movers.push({ pair: winner, direction: "stay", targetCourt: 1 });
            movers.push({ pair: loser, direction: "down", targetCourt: 2 });
        } else if (result.court === numCourts) {
            // Bottom court: loser stays (or swap with waiting)
            movers.push({ pair: winner, direction: "up", targetCourt: result.court - 1 });
            movers.push({ pair: loser, direction: "stay", targetCourt: result.court });
        } else {
            // Middle courts
            movers.push({ pair: winner, direction: "up", targetCourt: result.court - 1 });
            movers.push({ pair: loser, direction: "down", targetCourt: result.court + 1 });
        }
    }

    // Assign pairs to courts, handling conflicts by keeping higher-ranked mover
    for (const mover of movers) {
        const court = newCourts[mover.targetCourt - 1];
        if (!court.teamA) {
            court.teamA = mover.pair;
        } else if (!court.teamB) {
            court.teamB = mover.pair;
        }
        // Overflow handled by waiting pairs
    }

    return { courts: newCourts };
}

// ─── BYE LOGIC ──────────────────────────────────────────

/**
 * Calculate average score for a player sitting out (Bye).
 * Uses the average of their previous match scores.
 */
export function calculateByeScore(player) {
    if (player.matchesPlayed === 0) return 0;
    return Math.round(player.totalPoints / player.matchesPlayed);
}

// ─── SCORE PROCESSING ───────────────────────────────────

/**
 * Process a submitted match score and return updated player stats.
 * For individual modes: each player on winning team gets scoreA (or scoreB).
 * For team modes: the team gets the score.
 */
export function processMatchScore(match, allPlayers) {
    const teamAIds = JSON.parse(match.teamAIds);
    const teamBIds = JSON.parse(match.teamBIds);
    const isDraw = match.scoreA === match.scoreB;

    const updates = [];

    for (const pid of teamAIds) {
        const player = allPlayers.find(p => p.id === pid);
        if (player) {
            updates.push({
                id: pid,
                totalPoints: player.totalPoints + match.scoreA,
                matchesPlayed: player.matchesPlayed + 1,
                matchesWon: match.scoreA > match.scoreB ? player.matchesWon + 1 : player.matchesWon,
                matchesDrawn: isDraw ? (player.matchesDrawn || 0) + 1 : (player.matchesDrawn || 0),
            });
        }
    }

    for (const pid of teamBIds) {
        const player = allPlayers.find(p => p.id === pid);
        if (player) {
            updates.push({
                id: pid,
                totalPoints: player.totalPoints + match.scoreB,
                matchesPlayed: player.matchesPlayed + 1,
                matchesWon: match.scoreB > match.scoreA ? player.matchesWon + 1 : player.matchesWon,
                matchesDrawn: isDraw ? (player.matchesDrawn || 0) + 1 : (player.matchesDrawn || 0),
            });
        }
    }

    return updates;
}
