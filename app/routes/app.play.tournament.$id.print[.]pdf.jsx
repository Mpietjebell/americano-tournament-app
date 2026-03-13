import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { loadTournament } from "../utils/tournament-actions.server";
import { DEUCE_LABELS, TYPE_LABELS, buildTeams, getCountryDisplay } from "../utils/tournament-helpers";

const MATCHES_PER_COLUMN = 5;
const COURTS_PER_PAGE = 3;
const KNOCKOUT_TYPES = new Set(["knockout"]);
const SCHEDULE_TYPES = new Set(["americano", "mexicano", "team_americano", "team_mexicano", "king_of_the_court", "beat_the_box"]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 28,
    backgroundColor: "#F7F5F1",
    color: "#111111",
    fontSize: 9,
    position: "relative",
  },
  watermark: {
    position: "absolute",
    top: 165,
    left: 36,
    width: 770,
    height: 250,
    objectFit: "contain",
    opacity: 0.035,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  rules: {
    width: 190,
    gap: 3,
  },
  rulesTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3,
  },
  logoBlock: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 70,
  },
  insert: {
    color: "#33B067",
    fontSize: 36,
    fontWeight: 700,
    marginBottom: -2,
  },
  logoSub: {
    fontSize: 11,
    fontWeight: 500,
    marginBottom: 6,
  },
  logoSite: {
    fontSize: 7,
    letterSpacing: 1,
    color: "#4A4A4A",
  },
  uploadedLogo: {
    width: 100,
    height: 56,
    objectFit: "contain",
    marginBottom: 2,
  },
  qrBlock: {
    width: 215,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    gap: 10,
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  nopaLogo: {
    width: 108,
    height: 52,
    objectFit: "contain",
  },
  qrText: {
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1.4,
    marginTop: 8,
  },
  columns: {
    flexDirection: "row",
    gap: 18,
    justifyContent: "center",
    flexGrow: 1,
  },
  courtColumn: {
    position: "relative",
    paddingHorizontal: 8,
    width: 290,
  },
  divider: {
    position: "absolute",
    top: 0,
    right: -9,
    bottom: 0,
    width: 1,
    backgroundColor: "#E2DFDA",
  },
  courtTitle: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  matchCard: {
    height: 66,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#DADADA",
    marginBottom: 6,
    overflow: "hidden",
    position: "relative",
  },
  matchBorderGlow: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#EFEFEF",
  },
  matchVerticalLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: "#D6D6D6",
  },
  matchHorizontalLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#ECECEC",
  },
  playerLine: {
    position: "absolute",
    fontSize: 6.5,
    fontWeight: 700,
    color: "#3A3A3A",
  },
  scoreDot: {
    position: "absolute",
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: "#EDF1F3",
    borderWidth: 1,
    borderColor: "#D8DDE2",
    top: 24,
  },
  knockoutPage: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 28,
    backgroundColor: "#F7F5F1",
    color: "#111111",
    fontSize: 9,
    position: "relative",
  },
  knockoutStageTitle: {
    position: "absolute",
    top: 132,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  knockoutRules: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: "center",
  },
  knockoutRulesInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  knockoutQr: {
    width: 70,
    height: 70,
  },
  knockoutBrand: {
    width: 104,
    height: 48,
    objectFit: "contain",
  },
  knockoutCopy: {
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1.4,
    marginTop: 6,
  },
  bracketCard: {
    position: "absolute",
    width: 132,
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#DADADA",
    overflow: "hidden",
  },
  bracketCardWide: {
    width: 144,
    height: 64,
  },
});

function sanitizeFilename(value) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "tournament-schedule";
}

function getPlayerName(id, players) {
  return players.find((player) => player.id === id)?.name || "Name";
}

function findTeamEntry(teamIds, teams) {
  const normalized = [...teamIds].sort().join("|");
  return teams.find((team) => [...team.players.map((player) => player.id)].sort().join("|") === normalized) || null;
}

function getTeamNames(ids, players) {
  const parsedIds = Array.isArray(ids) ? ids : JSON.parse(ids || "[]");
  return parsedIds.map((id) => getPlayerName(id, players)).filter(Boolean);
}

function chunk(array, size) {
  const items = [];
  for (let index = 0; index < array.length; index += size) {
    items.push(array.slice(index, index + size));
  }
  return items;
}

function buildCourtPageGroups(rounds, numCourts) {
  const roundGroups = chunk(rounds, MATCHES_PER_COLUMN);
  const courtGroups = chunk(Array.from({ length: numCourts }, (_, index) => index + 1), COURTS_PER_PAGE);
  const pages = [];

  for (const roundGroup of roundGroups.length ? roundGroups : [[]]) {
    for (const courtGroup of courtGroups.length ? courtGroups : [[]]) {
      const courtStart = courtGroup[0] || 1;
      pages.push({ roundGroup, courtGroup, courtStart });
    }
  }

  return pages;
}

function MatchCard({ match, players, teams }) {
  const empty = !match;
  const teamA = empty ? ["Name 1", "Name 2"] : getTeamNames(match.teamAIds, players);
  const teamB = empty ? ["Name 3", "Name 4"] : getTeamNames(match.teamBIds, players);
  const parsedTeamAIds = empty ? [] : JSON.parse(match.teamAIds || "[]");
  const parsedTeamBIds = empty ? [] : JSON.parse(match.teamBIds || "[]");
  const teamAEntry = empty ? null : findTeamEntry(parsedTeamAIds, teams);
  const teamBEntry = empty ? null : findTeamEntry(parsedTeamBIds, teams);

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchBorderGlow} />
      <View style={styles.matchVerticalLine} />
      <View style={styles.matchHorizontalLine} />
      <Text style={[styles.playerLine, { top: 8, left: 10 }]}>{teamAEntry?.label ? `${teamAEntry.label} · ${teamA[0] || "Name 1"}` : teamA[0] || "Name 1"}</Text>
      <Text style={[styles.playerLine, { bottom: 8, left: 10 }]}>{teamA[1] || "Name 2"}</Text>
      <Text style={[styles.playerLine, { top: 8, right: 10 }]}>{teamBEntry?.label ? `${teamBEntry.label} · ${teamB[0] || "Name 3"}` : teamB[0] || "Name 3"}</Text>
      <Text style={[styles.playerLine, { bottom: 8, right: 10 }]}>{teamB[1] || "Name 4"}</Text>
      <View style={[styles.scoreDot, { left: 28 }]} />
      <View style={[styles.scoreDot, { right: 28 }]} />
    </View>
  );
}

function Header({ tournament, qrUrl, nopaLogoUrl }) {
  const uploadedLogo = tournament.logoUrl || null;

  return (
    <View style={styles.header}>
      <View style={styles.rules}>
        <Text style={styles.rulesTitle}>RULES:</Text>
        <Text>game mode: {TYPE_LABELS[tournament.type] || tournament.type}</Text>
        <Text>Points: {tournament.pointsPerMatch}</Text>
        <Text>40:40: {DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod}</Text>
        <Text>Match type: {tournament.courtsAvailable} courts</Text>
        <Text>Time: {[tournament.location, getCountryDisplay(tournament.country)].filter(Boolean).join(" · ")}</Text>
      </View>

      <View style={styles.logoBlock}>
        {uploadedLogo ? <Image src={uploadedLogo} style={styles.uploadedLogo} /> : <Text style={styles.insert}>Insert</Text>}
        {uploadedLogo ? null : <Text style={styles.logoSub}>LOGO</Text>}
        <Text style={styles.logoSite}>{uploadedLogo ? "TOURNAMENT LOGO" : "BY NOPA.BRAND.COM"}</Text>
      </View>

      <View style={styles.qrBlock}>
        <Image src={qrUrl} style={styles.qrImage} />
        <View>
          <Image src={nopaLogoUrl} style={styles.nopaLogo} />
          <Text style={styles.qrText}>Follow the score  scan{"\n"}or visit “The clubhouse”</Text>
        </View>
      </View>
    </View>
  );
}

function PageWatermark({ nopaLogoUrl }) {
  return <Image src={nopaLogoUrl} style={styles.watermark} fixed />;
}

function SchedulePage({ tournament, players, teams, qrUrl, nopaLogoUrl, courtNames, roundGroup, courtGroup, courtStart }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageWatermark nopaLogoUrl={nopaLogoUrl} />
      <Header tournament={tournament} qrUrl={qrUrl} nopaLogoUrl={nopaLogoUrl} />
      <View style={styles.columns}>
        {Array.from({ length: COURTS_PER_PAGE }, (_, courtIndex) => {
          const actualCourtNumber = courtGroup[courtIndex];
          const displayCourtNumber = actualCourtNumber || courtStart + courtIndex;

          return (
            <View key={displayCourtNumber} style={styles.courtColumn}>
              <Text style={styles.courtTitle}>{courtNames[displayCourtNumber - 1] || `COURT ${displayCourtNumber}`}</Text>
              {Array.from({ length: MATCHES_PER_COLUMN }, (_, slot) => {
                const round = roundGroup[slot];
                const match = actualCourtNumber ? round?.matches.find((item) => item.court === actualCourtNumber) : null;
                return <MatchCard key={`${displayCourtNumber}-${slot}`} match={match} players={players} teams={teams} />;
              })}
              {courtIndex < COURTS_PER_PAGE - 1 ? <View style={styles.divider} /> : null}
            </View>
          );
        })}
      </View>
    </Page>
  );
}

function BracketCard({ left, top, names = ["Name 1", "Name 2", "Name 3", "Name 4"], wide = false }) {
  return (
    <View style={[styles.bracketCard, wide ? styles.bracketCardWide : null, { left, top }]}>
      <View style={styles.matchBorderGlow} />
      <View style={styles.matchVerticalLine} />
      <View style={styles.matchHorizontalLine} />
      <Text style={[styles.playerLine, { top: 10, left: 12 }]}>{names[0]}</Text>
      <Text style={[styles.playerLine, { bottom: 10, left: 12 }]}>{names[1]}</Text>
      <Text style={[styles.playerLine, { top: 10, right: 12 }]}>{names[2]}</Text>
      <Text style={[styles.playerLine, { bottom: 10, right: 12 }]}>{names[3]}</Text>
      <View style={[styles.scoreDot, { left: 30, top: wide ? 21 : 16 }]} />
      <View style={[styles.scoreDot, { right: 30, top: wide ? 21 : 16 }]} />
    </View>
  );
}

function getKnockoutCards(rounds, players) {
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber).slice(0, 3);
  const stageLimits = [4, 2, 1];

  return sortedRounds.map((round, index) =>
    (round.matches || [])
      .slice(0, stageLimits[index])
      .map((match) => {
        const teamA = getTeamNames(match.teamAIds, players);
        const teamB = getTeamNames(match.teamBIds, players);

        return [
          teamA[0] || "Name 1",
          teamA[1] || "Name 2",
          teamB[0] || "Name 3",
          teamB[1] || "Name 4",
        ];
      }),
  );
}

function KnockoutPage({ tournament, players, qrUrl, nopaLogoUrl }) {
  const [quarterfinals = [], semifinals = [], finals = []] = getKnockoutCards(tournament.rounds, players);
  const quarterCard = (index) => quarterfinals[index] || ["Name 1", "Name 2", "Name 3", "Name 4"];
  const semiCard = (index) => semifinals[index] || ["Name 1", "Name 2", "Name 3", "Name 4"];
  const finalCard = finals[0] || ["Name 1", "Name 2", "Name 3", "Name 4"];

  return (
    <Page size="A4" orientation="landscape" style={styles.knockoutPage}>
      <PageWatermark nopaLogoUrl={nopaLogoUrl} />
      <View style={[styles.logoBlock, { marginBottom: 0 }]}>
        {tournament.logoUrl ? <Image src={tournament.logoUrl} style={styles.uploadedLogo} /> : <Text style={styles.insert}>Insert</Text>}
        {tournament.logoUrl ? null : <Text style={styles.logoSub}>LOGO</Text>}
        <Text style={styles.logoSite}>{tournament.logoUrl ? "TOURNAMENT LOGO" : "BY NOPA.BRAND.COM"}</Text>
      </View>

      <Text style={styles.knockoutStageTitle}>{TYPE_LABELS[tournament.type] || "Knockout"}</Text>

      <BracketCard left={6} top={120} names={quarterCard(0)} />
      <BracketCard left={6} top={456} names={quarterCard(1)} />
      <BracketCard left={186} top={288} names={semiCard(0)} />
      <BracketCard left={356} top={288} names={finalCard} wide />
      <BracketCard left={566} top={288} names={semiCard(1)} />
      <BracketCard left={742} top={120} names={quarterCard(2)} />
      <BracketCard left={742} top={456} names={quarterCard(3)} />

      <View style={styles.knockoutRules}>
        <View style={styles.knockoutRulesInner}>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.rulesTitle}>RULES:</Text>
            <Text>game mode: {TYPE_LABELS[tournament.type] || tournament.type}</Text>
            <Text>Points: {tournament.pointsPerMatch}</Text>
            <Text>40:40: {DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod}</Text>
            <Text>Match type: {tournament.courtsAvailable} courts</Text>
            <Text>Time: {[tournament.location, getCountryDisplay(tournament.country)].filter(Boolean).join(" · ")}</Text>
          </View>
          <Image src={qrUrl} style={styles.knockoutQr} />
          <View>
            <Image src={nopaLogoUrl} style={styles.knockoutBrand} />
            <Text style={styles.knockoutCopy}>Follow the score  scan{"\n"}or visit “The clubhouse”</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

function SchedulePdf({ tournament, origin }) {
  const players = tournament.setupPlayers || tournament.players;
  const teams = buildTeams(players);
  const courtNames = tournament.courtNames ? JSON.parse(tournament.courtNames) : [];
  const joinUrl = tournament.joinCode ? `${origin}/app/play/join/${tournament.joinCode}` : origin;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(joinUrl)}&size=240x240&margin=8&color=1C4F35`;
  const nopaLogoUrl = `${origin}/1Logo%20NOPA%20Green.png`;
  const schedulePages = buildCourtPageGroups(tournament.rounds, tournament.courtsAvailable);
  const isKnockout = KNOCKOUT_TYPES.has(tournament.type);
  const isSchedule = SCHEDULE_TYPES.has(tournament.type) || !isKnockout;

  return (
    <Document title={`${tournament.name} Insert`}>
      {isSchedule
        ? schedulePages.map(({ roundGroup, courtGroup, courtStart }, index) => (
            <SchedulePage
              key={`schedule-${index}`}
              tournament={tournament}
              players={players}
              teams={teams}
              qrUrl={qrUrl}
              nopaLogoUrl={nopaLogoUrl}
              courtNames={courtNames}
              roundGroup={roundGroup}
              courtGroup={courtGroup}
              courtStart={courtStart}
            />
          ))
        : null}
      {isKnockout ? <KnockoutPage tournament={tournament} players={players} qrUrl={qrUrl} nopaLogoUrl={nopaLogoUrl} /> : null}
    </Document>
  );
}

export async function loader({ params, request }) {
  const tournament = await loadTournament(params.id);
  if (!tournament) throw new Response("Not Found", { status: 404 });

  const origin = new URL(request.url).origin;
  const buffer = await renderToBuffer(<SchedulePdf tournament={tournament} origin={origin} />);
  const fileName = `${sanitizeFilename(tournament.name)}-insert.pdf`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
