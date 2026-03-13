export const TYPE_LABELS = {
  americano: "Americano",
  mexicano: "Mexicano",
  mixicano: "Mixicano",
  team_americano: "Team Americano",
  team_mexicano: "Team Mexicano",
  king_of_the_court: "King of the Court",
  beat_the_box: "Beat the Box",
};

export const DEUCE_LABELS = {
  deuce: "Deuce",
  golden_point: "Golden Point",
  starpoint: "Starpoint",
  tie_break: "Tie Break",
};

export function getCountryDisplay(countryCode) {
  if (!countryCode || countryCode === "OTHER") return "International";

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

export function buildJoinInviteText(tournament, joinUrl) {
  const locationLine = tournament.location ? `${tournament.location}\n` : "";
  const typeLabel = TYPE_LABELS[tournament.type] || tournament.type;

  return [
    `${tournament.name}`,
    locationLine.trim(),
    `${typeLabel} tournament`,
    "",
    `Join code: ${tournament.joinCode}`,
    joinUrl,
    "",
    "Powered by NOPA Padel",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildResultsShareText(tournament, players, pageUrl) {
  const topThree = players
    .slice(0, 3)
    .map((player, index) => `${index + 1}. ${player.name} - ${player.totalPoints} pts`)
    .join("\n");

  return [
    `${tournament.name} Final Results`,
    "",
    topThree,
    "",
    `MVP: ${players[0]?.name || "TBD"}`,
    "Powered by NOPA Padel",
    pageUrl,
  ].join("\n");
}

export function getTeamColor(index) {
  const teamColors = [
    { bg: "rgba(28,79,53,0.10)", border: "rgba(28,79,53,0.24)", accent: "#1C4F35" },
    { bg: "rgba(197,165,90,0.12)", border: "rgba(197,165,90,0.30)", accent: "#A67C2E" },
    { bg: "rgba(53,97,76,0.10)", border: "rgba(53,97,76,0.26)", accent: "#35614C" },
    { bg: "rgba(120,145,129,0.14)", border: "rgba(120,145,129,0.28)", accent: "#647C71" },
  ];

  return teamColors[index % teamColors.length];
}

export function getPlacementLabel(index) {
  return `${index + 1}`;
}

export function getMinimumPlayers(type) {
  if (type === "mexicano" || type === "team_mexicano" || type === "king_of_the_court") {
    return 8;
  }

  return 4;
}

export function getDefaultRounds(type, players = [], teams = []) {
  if (type === "king_of_the_court") return 6;
  if (type === "team_americano" || type === "team_mexicano") {
    return teams.length % 2 === 0 ? Math.max(0, teams.length - 1) : teams.length;
  }

  return Math.max(0, players.length - 1);
}

export function isDynamicFormat(type) {
  return new Set(["mexicano", "team_mexicano", "king_of_the_court"]).has(type);
}

export function buildTeams(players = []) {
  const teamsById = new Map();
  const unassigned = [];

  for (const player of players) {
    if (player.teamId) {
      if (!teamsById.has(player.teamId)) {
        teamsById.set(player.teamId, {
          id: player.teamId,
          label: "",
          players: [],
        });
      }
      teamsById.get(player.teamId).players.push(player);
    } else {
      unassigned.push(player);
    }
  }

  const teams = [...teamsById.values()].sort((a, b) => {
    const aMatch = String(a.id).match(/(\d+)$/);
    const bMatch = String(b.id).match(/(\d+)$/);
    if (aMatch && bMatch && Number(aMatch[1]) !== Number(bMatch[1])) {
      return Number(aMatch[1]) - Number(bMatch[1]);
    }
    return String(a.id).localeCompare(String(b.id));
  });

  for (let index = 0; index < unassigned.length; index += 2) {
    const team = {
      id: `unassigned-${Math.floor(index / 2) + 1}`,
      label: `Team ${teams.length + 1}`,
      players: unassigned.slice(index, index + 2),
    };
    teams.push(team);
  }

  return teams.map((team, index) => ({
    ...team,
    label: `Team ${index + 1}`,
  }));
}

export function buildTeamStandings(players = []) {
  return buildTeams(players)
    .filter((team) => team.players.length > 0)
    .map((team) => {
      const totalPoints = team.players.reduce((sum, player) => sum + (player.totalPoints || 0), 0);
      const matchesPlayed = Math.max(...team.players.map((player) => player.matchesPlayed || 0), 0);
      const matchesWon = Math.max(...team.players.map((player) => player.matchesWon || 0), 0);
      const matchesDrawn = Math.max(...team.players.map((player) => player.matchesDrawn || 0), 0);

      return {
        ...team,
        totalPoints,
        matchesPlayed,
        matchesWon,
        matchesDrawn,
        name: team.players.map((player) => player.name).join(" & "),
      };
    })
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      if (b.matchesDrawn !== a.matchesDrawn) return b.matchesDrawn - a.matchesDrawn;
      return a.name.localeCompare(b.name);
    });
}

export function getTournamentStats({ type, players = [], courtsAvailable = 0, pointsPerMatch = 0 }) {
  const playerCount = players.length;
  const minPlayers = getMinimumPlayers(type);
  if (playerCount < minPlayers) return null;

  const minutesPerRound = pointsPerMatch * 0.5;

  if (type === "team_americano" || type === "team_mexicano") {
    const teams = buildTeams(players).filter((team) => team.players.length > 0);
    const teamCount = teams.length;
    if (teamCount < 2) return null;

    const activeCourts = Math.min(courtsAvailable, Math.floor(teamCount / 2));
    const totalRounds = getDefaultRounds(type, players, teams);
    const totalMatches = type === "team_americano"
      ? Math.floor((teamCount * (teamCount - 1)) / 2)
      : totalRounds * activeCourts;
    const totalMinutes = totalRounds * minutesPerRound;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);

    return {
      formatKind: "team",
      teamCount,
      activeCourts,
      totalRounds,
      totalMatches,
      matchesPerEntry: Math.max(0, teamCount - 1),
      duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    };
  }

  if (type === "king_of_the_court") {
    const activeCourts = Math.min(courtsAvailable, Math.floor(playerCount / 4));
    const totalRounds = getDefaultRounds(type, players, []);
    const totalMatches = totalRounds * activeCourts;
    const totalMinutes = totalRounds * minutesPerRound;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);

    return {
      formatKind: "individual",
      teamCount: null,
      activeCourts,
      totalRounds,
      totalMatches,
      matchesPerEntry: Math.round((totalMatches * 4) / playerCount),
      duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    };
  }

  const activeCourts = Math.min(courtsAvailable, Math.floor(playerCount / 4));
  const totalRounds = getDefaultRounds(type, players, []);
  const totalMatches = totalRounds * activeCourts;
  const totalMinutes = totalRounds * minutesPerRound;
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);

  return {
    formatKind: "individual",
    teamCount: null,
    activeCourts,
    totalRounds,
    totalMatches,
    matchesPerEntry: Math.round((totalMatches * 4) / playerCount),
    duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
  };
}
