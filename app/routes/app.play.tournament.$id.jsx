import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import prisma from "../db.server";
import { loadTournament, generateAllRounds, submitScore } from "../utils/tournament-actions.server";
import {
    buildTeams,
    buildTeamStandings,
    buildJoinInviteText,
    DEUCE_LABELS,
    getTeamColor,
    getPlacementLabel,
    isDynamicFormat,
    getTournamentStats,
    TYPE_LABELS,
} from "../utils/tournament-helpers";
import { getHostTokenFromRequest } from "../utils/host-auth.server";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const origin = new URL(request.url).origin;
    const hostToken = getHostTokenFromRequest(request, tournament.id);
    const isHost = Boolean(hostToken && hostToken === tournament.hostToken);
    return json({ tournament, origin, isHost });
};

export const action = async ({ request, params }) => {
    const formData = await request.formData();
    const intent = formData.get("intent");

    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });

    const hostToken = getHostTokenFromRequest(request, tournament.id);
    const isHost = Boolean(hostToken && hostToken === tournament.hostToken);
    if (!isHost) {
        return json({ error: "Host access required." }, { status: 403 });
    }

    if (intent === "generate_all_rounds") {
        await generateAllRounds(tournament);
        return json({ success: true });
    }

    if (intent === "submit_score") {
        const matchId = formData.get("matchId");
        const scoreA = parseInt(formData.get("scoreA"), 10);
        const scoreB = parseInt(formData.get("scoreB"), 10);
        const result = await submitScore(tournament, matchId, scoreA, scoreB);
        if (result.error) return json({ error: result.error }, { status: 400 });
        return json({ success: true });
    }

    if (intent === "update_player_setup") {
        const playerId = formData.get("playerId");
        const name = String(formData.get("name") || "").trim();
        const teamIdValue = String(formData.get("teamId") || "").trim();
        if (!playerId || !name) {
            return json({ error: "Player name is required." }, { status: 400 });
        }

        const duplicate = tournament.players.find((player) => player.id !== playerId && player.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
            return json({ error: "Player name must be unique." }, { status: 400 });
        }

        if ((tournament.type === "team_americano" || tournament.type === "team_mexicano") && teamIdValue) {
            const sameTeamPlayers = tournament.setupPlayers.filter((player) => player.teamId === teamIdValue && player.id !== playerId);
            if (sameTeamPlayers.length >= 2) {
                return json({ error: "A fixed team can only contain two players." }, { status: 400 });
            }
        }

        await prisma.player.update({
            where: { id: playerId },
            data: {
                name,
                teamId: teamIdValue || null,
            },
        });

        return json({ success: true });
    }

    if (intent === "update_team_assignments") {
        const payload = String(formData.get("players") || "[]");
        let submittedPlayers;

        try {
            submittedPlayers = JSON.parse(payload);
        } catch {
            return json({ error: "Invalid team assignment payload." }, { status: 400 });
        }

        if (!Array.isArray(submittedPlayers) || submittedPlayers.length !== tournament.setupPlayers.length) {
            return json({ error: "Incomplete team assignment payload." }, { status: 400 });
        }

        const seenNames = new Set();
        const teamSizes = new Map();
        for (const submittedPlayer of submittedPlayers) {
            const name = String(submittedPlayer.name || "").trim();
            const teamId = String(submittedPlayer.teamId || "").trim();
            if (!name || !teamId) {
                return json({ error: "Every player needs a name and team." }, { status: 400 });
            }
            const nameKey = name.toLowerCase();
            if (seenNames.has(nameKey)) {
                return json({ error: "Player names must be unique." }, { status: 400 });
            }
            seenNames.add(nameKey);
            teamSizes.set(teamId, (teamSizes.get(teamId) || 0) + 1);
            if (teamSizes.get(teamId) > 2) {
                return json({ error: "Each team can only contain two players." }, { status: 400 });
            }
        }

        await prisma.$transaction(
            submittedPlayers.map((submittedPlayer) =>
                prisma.player.update({
                    where: { id: submittedPlayer.id },
                    data: {
                        name: String(submittedPlayer.name).trim(),
                        teamId: String(submittedPlayer.teamId).trim(),
                    },
                }),
            ),
        );

        return json({ success: true });
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

function getPlayerName(id, players) {
    return players.find((p) => p.id === id)?.name || "Unknown";
}

function findTeamEntry(teamIds, teams) {
    const normalized = [...teamIds].sort().join("|");
    return teams.find((team) => [...team.players.map((player) => player.id)].sort().join("|") === normalized) || null;
}

function fallbackCopy(text, onSuccess) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(el);
    el.select();
    try { document.execCommand("copy"); onSuccess?.(); } catch { /* silent */ }
    document.body.removeChild(el);
}

export default function PublicTournamentView() {
    const { tournament, origin, isHost } = useLoaderData();
    const fetcher = useFetcher();
    const [activeTab, setActiveTab] = useState("courts");
    const [copied, setCopied] = useState(false);
    const [showShare, setShowShare] = useState(false);

    const players = tournament.players;
    const setupPlayers = tournament.setupPlayers || tournament.players;
    const isTeamMode = tournament.type === "team_americano" || tournament.type === "team_mexicano";
    const setupTeams = buildTeams(setupPlayers);
    const teamStandings = isTeamMode ? buildTeamStandings(players) : [];
    const tournamentStats = getTournamentStats({
        type: tournament.type,
        players: setupPlayers,
        courtsAvailable: tournament.courtsAvailable,
        pointsPerMatch: tournament.pointsPerMatch,
    });
    const hasRounds = tournament.rounds.length > 0;
    const allMatches = tournament.rounds.flatMap((r) =>
        r.matches.map((m) => ({ ...m, roundNumber: r.roundNumber }))
    );
    const completedMatches = allMatches.filter((m) => m.status === "completed");
    const pendingMatches = allMatches.filter((m) => m.status !== "completed");
    const isFinished = tournament.status === "finished" || (hasRounds && pendingMatches.length === 0 && completedMatches.length > 0);

    const joinUrl = tournament.joinCode ? `${origin}/app/play/join/${tournament.joinCode}` : null;
    const qrUrl = joinUrl ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(joinUrl)}&size=200x200&margin=10&color=1C4F35` : null;
    const waText = joinUrl ? encodeURIComponent(buildJoinInviteText(tournament, joinUrl)) : null;

    const handleCopy = () => {
        if (!joinUrl) return;
        const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(joinUrl).then(finish).catch(() => fallbackCopy(joinUrl, finish));
        } else {
            fallbackCopy(joinUrl, finish);
        }
    };

    const duration = tournamentStats?.duration;
    const plannedRounds = tournamentStats?.totalRounds || 0;
    const generatesRoundsDynamically = isDynamicFormat(tournament.type);

    useEffect(() => {
        if (isFinished && activeTab === "courts") {
            const timer = setTimeout(() => setActiveTab("leaderboard"), 500);
            return () => clearTimeout(timer);
        }
    }, [activeTab, isFinished]);

    return (
        <>
            <nav className="ios-nav">
                <Link to="/app/play" className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Home
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 64 }} />
            </nav>
            <div className="ios-page">
                <div style={{ marginBottom: 20 }}>
                    {tournament.logoUrl && (
                        <div style={{
                            width: 92,
                            height: 92,
                            borderRadius: "24px",
                            overflow: "hidden",
                            background: "var(--bg-card)",
                            boxShadow: "var(--shadow)",
                            marginBottom: 16,
                        }}>
                            <img src={tournament.logoUrl} alt={`${tournament.name} logo`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                    )}
                    <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.9rem", fontWeight: 400, color: "var(--label)", marginBottom: 4 }}>
                        {tournament.name}
                    </h1>
                    <p style={{ fontSize: "0.82rem", color: "var(--label-3)", marginBottom: hasRounds ? 12 : 0 }}>
                        {TYPE_LABELS[tournament.type]} · {players.length} players{isTeamMode ? ` · ${setupTeams.length} teams` : ""} · {tournament.courtsAvailable} courts · {tournament.pointsPerMatch} pts
                    </p>
                    {hasRounds && (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--label-3)", marginBottom: 5 }}>
                                <span>{completedMatches.length} / {allMatches.length} matches</span>
                                <span style={{ fontWeight: 600, color: "var(--green)" }}>{Math.round((completedMatches.length / allMatches.length) * 100)}%</span>
                            </div>
                            <div style={{ height: 5, background: "var(--sep-opaque)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(completedMatches.length / allMatches.length) * 100}%`, background: "var(--green)", borderRadius: 3, transition: "width 0.4s ease" }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Host toolbar ── */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    background: "var(--bg-card)", border: "1px solid var(--sep-opaque)",
                    borderRadius: "var(--r-card)", padding: "12px 16px", marginBottom: 20,
                    boxShadow: "var(--shadow)",
                }}>
                    {tournament.joinCode && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: "auto" }}>
                            <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 600 }}>Code</span>
                            <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1rem", letterSpacing: "0.2em", color: "var(--green)", background: "var(--bg-fill-2)", borderRadius: "var(--r-sm)", padding: "3px 10px" }}>
                                {tournament.joinCode}
                            </span>
                        </div>
                    )}
                    {!isHost && (
                        <div style={{ marginRight: "auto", fontSize: "0.72rem", color: "var(--label-3)" }}>
                            Read-only spectator view
                        </div>
                    )}
                    <a
                        href={`/app/play/tournament/${tournament.id}/print.pdf`}
                        download
                        style={{ textDecoration: "none" }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 14px",
                                borderRadius: "var(--r-pill)",
                                background: "var(--bg-fill)",
                                color: "var(--label-2)",
                                fontWeight: 500,
                                fontSize: "0.85rem",
                                fontFamily: "inherit",
                            }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M7 8V4h10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 17H5a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M7 14h10v6H7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="17" cy="11" r="1" fill="currentColor" />
                            </svg>
                            PDF
                        </div>
                    </a>
                    <button
                        onClick={() => setShowShare(s => !s)}
                        style={{
                            padding: "7px 14px", borderRadius: "var(--r-pill)",
                            background: showShare ? "var(--green)" : "var(--bg-fill)",
                            color: showShare ? "white" : "var(--label-2)",
                            fontWeight: 500, fontSize: "0.85rem", border: "none",
                            cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                        }}
                    >
                        Share & QR
                    </button>
                </div>

                {/* ── Share Panel ── */}
                {showShare && (
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "20px", marginBottom: 20, boxShadow: "var(--shadow-md)", border: "1px solid var(--sep-opaque)" }}>
                        <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 16, fontWeight: 600 }}>Share with Players</div>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                            {qrUrl && (
                                <div style={{ textAlign: "center", flexShrink: 0 }}>
                                    <img src={qrUrl} alt="QR Code" style={{ width: 140, height: 140, borderRadius: "var(--r-cell)", display: "block" }} />
                                    <div style={{ fontSize: "0.7rem", color: "var(--label-3)", marginTop: 6 }}>Scan to join</div>
                                </div>
                            )}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 180 }}>
                                {tournament.joinCode && (
                                    <div style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "12px 16px", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>Join Code</div>
                                        <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: "1.8rem", letterSpacing: "0.3em", color: "var(--green)" }}>{tournament.joinCode}</div>
                                    </div>
                                )}
                                {waText && (
                                    <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px 16px", background: "#25D366", borderRadius: "var(--r-cell)", color: "white", fontWeight: 600, fontSize: "0.9rem" }}>
                                            Share on WhatsApp
                                        </div>
                                    </a>
                                )}
                                <button type="button" onClick={handleCopy} style={{
                                    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                                    background: copied ? "rgba(28,79,53,0.06)" : "var(--bg-grouped)",
                                    border: `1.5px solid ${copied ? "var(--green)" : "var(--sep-opaque)"}`,
                                    borderRadius: "var(--r-cell)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%",
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: copied ? "var(--green)" : "var(--label)", fontSize: "0.88rem" }}>{copied ? "Copied!" : "Copy Join Link"}</div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--label-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, marginTop: 2 }}>{joinUrl}</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Stats strip ── */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
                    {[
                        { label: "Mode", value: TYPE_LABELS[tournament.type] || tournament.type },
                        { label: "Players", value: players.length },
                        ...(isTeamMode ? [{ label: "Teams", value: setupTeams.length }] : []),
                        { label: "Courts", value: tournament.courtsAvailable },
                        { label: "Points", value: tournament.pointsPerMatch },
                        { label: "40:40", value: DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod },
                        { label: "Est.", value: duration || "—" },
                        { label: "Rounds", value: hasRounds ? tournament.rounds.length : plannedRounds || "—" },
                    ].map(item => (
                        <div key={item.label} style={{ background: "var(--bg-card)", borderRadius: "var(--r-sm)", padding: "8px 12px", flexShrink: 0, boxShadow: "var(--shadow)" }}>
                            <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginBottom: 2, fontWeight: 600 }}>{item.label}</div>
                            <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--green)" }}>{item.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── Segmented tabs ── */}
                <div style={{ display: "flex", background: "var(--bg-fill)", borderRadius: "var(--r-cell)", padding: 3, marginBottom: 24, gap: 2 }}>
                    {[
                        { id: "courts", label: `Courts${pendingMatches.length > 0 ? ` (${pendingMatches.length})` : ""}` },
                        { id: "leaderboard", label: "Leaderboard" },
                        { id: "matches", label: "All Matches" },
                    ].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            flex: 1, padding: "8px 4px", borderRadius: "calc(var(--r-cell) - 3px)",
                            background: activeTab === tab.id ? "var(--bg-card)" : "transparent",
                            color: activeTab === tab.id ? "var(--label)" : "var(--label-3)",
                            fontWeight: activeTab === tab.id ? 600 : 400,
                            fontSize: "0.82rem", border: "none", cursor: "pointer",
                            fontFamily: "inherit", transition: "all 0.2s",
                            boxShadow: activeTab === tab.id ? "var(--shadow)" : "none",
                        }}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ──────── COURTS TAB ──────── */}
                {activeTab === "courts" && (
                    <>
                        {!hasRounds && isHost && (
                            <div style={{ marginBottom: 24, background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "28px 20px", textAlign: "center", boxShadow: "var(--shadow)" }}>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.3rem", color: "var(--label-2)", marginBottom: 8 }}>Ready to play?</div>
                                <p style={{ fontSize: "0.83rem", color: "var(--label-3)", marginBottom: 20 }}>
                                    {generatesRoundsDynamically
                                        ? `Start the tournament. Rounds will continue automatically until ${plannedRounds} rounds are complete.`
                                        : `Generate all ${plannedRounds} rounds at once.`}
                                </p>
                                <fetcher.Form method="post">
                                    <input type="hidden" name="intent" value="generate_all_rounds" />
                                    <button type="submit" disabled={fetcher.state !== "idle"} style={{
                                        padding: "13px 32px", borderRadius: "var(--r-card)",
                                        background: "var(--green)", color: "white",
                                        fontWeight: 600, fontSize: "0.95rem", border: "none",
                                        cursor: "pointer", fontFamily: "inherit",
                                        boxShadow: "0 4px 16px rgba(28,79,53,0.3)",
                                    }}>
                                        {fetcher.state !== "idle" ? "Generating..." : generatesRoundsDynamically ? "Start Tournament" : `Generate All ${plannedRounds} Rounds`}
                                    </button>
                                </fetcher.Form>

                                <div style={{ marginTop: 24, textAlign: "left" }}>
                                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>
                                        {isTeamMode ? "Team Setup" : "Player List"}
                                    </div>
                                    {isTeamMode ? (
                                        <DragTeamBoard players={setupPlayers} />
                                    ) : (
                                        <div style={{ display: "grid", gap: 8 }}>
                                            {setupPlayers.map((player, index) => (
                                                <PlayerSetupEditor
                                                    key={player.id}
                                                    player={player}
                                                    index={index}
                                                    isTeamMode={isTeamMode}
                                                    teamOptions={setupTeams.length}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {!hasRounds && !isHost && (
                            <div style={{ marginBottom: 24, background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "28px 20px", textAlign: "center", boxShadow: "var(--shadow)" }}>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.3rem", color: "var(--label-2)", marginBottom: 8 }}>Waiting for host</div>
                                <p style={{ fontSize: "0.83rem", color: "var(--label-3)", lineHeight: 1.6 }}>
                                    Rounds have not been generated yet. The tournament host needs to start play from their private host session.
                                </p>
                            </div>
                        )}

                        {tournament.rounds.map((round) => {
                            const roundCompleted = round.matches.every((m) => m.status === "completed");
                            const roundActive = round.matches.some((m) => m.status === "completed");
                            return (
                                <div key={round.id} style={{ marginBottom: 32 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingLeft: 4 }}>
                                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--label-2)" }}>Round {round.roundNumber}</div>
                                        <span style={{
                                            fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: "var(--r-pill)",
                                            background: roundCompleted ? "rgba(28,79,53,0.1)" : roundActive ? "rgba(197,165,90,0.12)" : "var(--bg-fill)",
                                            color: roundCompleted ? "var(--green)" : roundActive ? "#8B7340" : "var(--label-3)",
                                        }}>
                                            {roundCompleted ? "Done" : roundActive ? "In Progress" : "Pending"}
                                        </span>
                                    </div>
                                    <div className="nopa-courts-grid">
                                        {round.matches.map((match) => {
                                            const teamA = JSON.parse(match.teamAIds);
                                            const teamB = JSON.parse(match.teamBIds);
                                            return <CourtCard key={match.id} match={match} teamA={teamA} teamB={teamB} players={players} fetcher={fetcher} pointsPerMatch={tournament.pointsPerMatch} isHost={isHost} />;
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {isFinished && (
                            <div style={{
                                background: "linear-gradient(135deg, var(--green-dark), var(--green))",
                                color: "white", borderRadius: "var(--r-card)",
                                padding: "28px 24px", textAlign: "center", marginTop: 8,
                                boxShadow: "0 6px 24px rgba(28,79,53,0.35)",
                            }}>
                                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.6rem", marginBottom: 4 }}>Tournament Complete</div>
                                <p style={{ opacity: 0.75, fontSize: "0.85rem", marginBottom: 16 }}>{completedMatches.length} matches played</p>
                                <button style={{ padding: "11px 24px", borderRadius: "var(--r-pill)", background: "white", color: "var(--green)", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer", fontFamily: "inherit" }} onClick={() => setActiveTab("leaderboard")}>
                                    View Leaderboard
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ──────── LEADERBOARD TAB ──────── */}
                {activeTab === "leaderboard" && (
                    <>
                        {isFinished && (() => {
                            const mvp = isTeamMode ? teamStandings[0] : players[0];
                            const podiumEntries = isTeamMode ? teamStandings : players;
                            return (
                                <div style={{
                                    background: "linear-gradient(135deg, var(--green-dark), var(--green))",
                                    color: "white", borderRadius: "var(--r-card)", padding: "28px 20px",
                                    textAlign: "center", marginBottom: 20,
                                    boxShadow: "0 6px 24px rgba(28,79,53,0.3)",
                                }}>
                                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.5rem", marginBottom: 4 }}>Final Results</div>
                                    <div style={{ fontSize: "0.78rem", opacity: 0.7, marginBottom: 20 }}>{completedMatches.length} matches · {tournament.rounds.length} rounds</div>

                                    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 20 }}>
                                        {[1, 0, 2].map(rank => {
                                            const p = podiumEntries[rank];
                                            if (!p) return null;
                                            const teamTone = isTeamMode ? getTeamColor(rank) : null;
                                            const isFirst = rank === 0;
                                            return (
                                                <div key={p.id} style={{ textAlign: "center", flex: 1, maxWidth: 120 }}>
                                                    <div style={{ width: isFirst ? 34 : 28, height: isFirst ? 34 : 28, margin: "0 auto 8px", borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700 }}>
                                                        {getPlacementLabel(rank)}
                                                    </div>
                                                    <div style={{
                                                        background: "rgba(255,255,255,0.12)", borderRadius: isFirst ? "12px 12px 0 0" : "10px 10px 0 0",
                                                        padding: isFirst ? "16px 10px 12px" : "12px 8px 10px",
                                                        border: `1px solid ${isTeamMode ? teamTone.border : "rgba(255,255,255,0.15)"}`,
                                                    }}>
                                                        <div style={{ fontWeight: 700, fontSize: isFirst ? "0.92rem" : "0.8rem", marginBottom: 3 }}>{p.name}</div>
                                                        {isTeamMode && <div style={{ fontSize: "0.58rem", opacity: 0.72, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{p.label}</div>}
                                                        <div style={{ fontSize: isFirst ? "1.5rem" : "1.2rem", fontWeight: 900, color: isTeamMode ? teamTone.accent : rank === 0 ? "var(--gold)" : rank === 1 ? "#ccc" : "#CD7F32" }}>{p.totalPoints}</div>
                                                        <div style={{ fontSize: "0.58rem", opacity: 0.6, textTransform: "uppercase" }}>pts</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {mvp && (
                                        <div style={{ background: "rgba(197,165,90,0.2)", border: "1px solid rgba(197,165,90,0.4)", borderRadius: "var(--r-cell)", padding: "10px 18px", display: "inline-block", marginBottom: 18 }}>
                                            <div style={{ fontSize: "0.62rem", letterSpacing: "0.1em", opacity: 0.8, textTransform: "uppercase", marginBottom: 2 }}>{isTeamMode ? "Champion Team" : "MVP Award"}</div>
                                            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{mvp.name} · {mvp.totalPoints} pts</div>
                                        </div>
                                    )}

                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                        <Link to={`/app/play/tournament/${tournament.id}/final`} style={{ textDecoration: "none" }}>
                                            <button style={{ padding: "10px 20px", borderRadius: "var(--r-pill)", background: "white", color: "var(--green)", fontWeight: 600, fontSize: "0.88rem", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                                Share Results
                                            </button>
                                        </Link>
                                        <Link to={`/app/play/tournament/${tournament.id}/final`} style={{ textDecoration: "none" }}>
                                            <button style={{ padding: "10px 20px", borderRadius: "var(--r-pill)", background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)", fontWeight: 500, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit" }}>
                                                Full Awards
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            );
                        })()}

                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 10, fontWeight: 600, paddingLeft: 4 }}>
                            {isFinished ? "Final Standings" : "Live Leaderboard"}
                        </div>
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                            {(isTeamMode ? teamStandings : players).map((entry, i, list) => {
                                const losses = entry.matchesPlayed - entry.matchesWon - (entry.matchesDrawn || 0);
                                const teamTone = isTeamMode ? getTeamColor(i) : null;
                                return (
                                    <div key={entry.id} style={{
                                        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                                        borderBottom: i < list.length - 1 ? "1px solid var(--sep)" : "none",
                                        background: isTeamMode ? teamTone.bg : i === 0 && isFinished ? "rgba(197,165,90,0.05)" : undefined,
                                    }}>
                                        <div style={{ width: 24, textAlign: "center", fontSize: i < 3 && isFinished ? "1rem" : "0.82rem", flexShrink: 0, color: "var(--label-3)", fontWeight: 700 }}>
                                            {getPlacementLabel(i)}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: isTeamMode ? teamTone.accent : "var(--label)" }}>{entry.name}</div>
                                            {isTeamMode && (
                                                <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 2 }}>{entry.label}</div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: "1rem", fontWeight: 700, color: isTeamMode ? teamTone.accent : "var(--green)", minWidth: 32, textAlign: "right" }}>{entry.totalPoints}</div>
                                        <div style={{ fontSize: "0.7rem", color: "var(--label-3)", minWidth: 80, textAlign: "right" }}>
                                            {entry.matchesPlayed}P · {entry.matchesWon}W · {losses}L
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {completedMatches.length > 0 && (
                            <div>
                                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 10, fontWeight: 600, paddingLeft: 4 }}>All Results</div>
                                {tournament.rounds.map((round) => {
                                    const roundMatches = round.matches.filter(m => m.status === "completed");
                                    if (roundMatches.length === 0) return null;
                                    return (
                                        <div key={round.id} style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 12, boxShadow: "var(--shadow)" }}>
                                            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--sep)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 600 }}>
                                                Round {round.roundNumber}
                                            </div>
                                            {roundMatches.map((m, mi) => {
                                                const tA = JSON.parse(m.teamAIds);
                                                const tB = JSON.parse(m.teamBIds);
                                                return (
                                                    <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: mi < roundMatches.length - 1 ? "1px solid var(--sep)" : "none", fontSize: "0.83rem", gap: 10 }}>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontWeight: m.scoreA >= m.scoreB ? 600 : 400, color: m.scoreA >= m.scoreB ? "var(--label)" : "var(--label-3)" }}>{tA.map((id) => getPlayerName(id, players)).join(" & ")}</span>
                                                            <span style={{ color: "var(--label-4)", margin: "0 6px", fontSize: "0.65rem" }}>vs</span>
                                                            <span style={{ fontWeight: m.scoreB >= m.scoreA ? 600 : 400, color: m.scoreB >= m.scoreA ? "var(--label)" : "var(--label-3)" }}>{tB.map((id) => getPlayerName(id, players)).join(" & ")}</span>
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: "var(--green)", whiteSpace: "nowrap", fontFamily: "monospace" }}>{m.scoreA}–{m.scoreB}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* ──────── MATCHES TAB ──────── */}
                {activeTab === "matches" && (
                    <div>
                        {tournament.rounds.map((round) => {
                            const done = round.matches.every(m => m.status === "completed");
                            const active = round.matches.some(m => m.status === "completed");
                            return (
                                <div key={round.id} style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 14, boxShadow: "var(--shadow)" }}>
                                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--sep)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--label-2)" }}>Round {round.roundNumber}</span>
                                        <span style={{
                                            fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: "var(--r-pill)",
                                            background: done ? "rgba(28,79,53,0.1)" : active ? "rgba(197,165,90,0.12)" : "var(--bg-fill)",
                                            color: done ? "var(--green)" : active ? "#8B7340" : "var(--label-3)",
                                        }}>
                                            {done ? "Done" : active ? "In Progress" : "Pending"}
                                        </span>
                                    </div>
                                    {round.matches.map((m, mi) => {
                                        const tA = JSON.parse(m.teamAIds);
                                        const tB = JSON.parse(m.teamBIds);
                                        return (
                                            <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: mi < round.matches.length - 1 ? "1px solid var(--sep)" : "none", gap: 10 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: "0.65rem", color: "var(--label-3)", marginBottom: 2 }}>Court {m.court}</div>
                                                    <span style={{ fontWeight: m.status === "completed" && m.scoreA >= m.scoreB ? 600 : 400, fontSize: "0.85rem", color: "var(--label)" }}>{tA.map((id) => getPlayerName(id, players)).join(" & ")}</span>
                                                    <span style={{ color: "var(--label-4)", margin: "0 6px", fontSize: "0.65rem" }}>vs</span>
                                                    <span style={{ fontWeight: m.status === "completed" && m.scoreB >= m.scoreA ? 600 : 400, fontSize: "0.85rem", color: "var(--label)" }}>{tB.map((id) => getPlayerName(id, players)).join(" & ")}</span>
                                                </div>
                                                {m.status === "completed" ? (
                                                    <span style={{ fontWeight: 700, color: "var(--green)", fontFamily: "monospace" }}>{m.scoreA}–{m.scoreB}</span>
                                                ) : (
                                                    <span style={{ fontSize: "0.72rem", color: "var(--label-3)", background: "var(--bg-fill)", padding: "3px 8px", borderRadius: "var(--r-pill)" }}>Pending</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {tournament.rounds.length === 0 && (
                            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--label-3)" }}>
                                <div style={{ fontSize: "2rem", marginBottom: 8 }}>—</div>
                                <div style={{ fontSize: "0.9rem" }}>No matches yet. Generate rounds first.</div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

function PlayerSetupEditor({ player, index, isTeamMode, teamOptions }) {
    const fetcher = useFetcher();
    const [name, setName] = useState(player.name);
    const fallbackTeam = `team-${Math.floor(index / 2) + 1}`;
    const [teamId, setTeamId] = useState(player.teamId || fallbackTeam);
    const isSaving = fetcher.state !== "idle";

    useEffect(() => {
        setName(player.name);
        setTeamId(player.teamId || fallbackTeam);
    }, [fallbackTeam, player.name, player.teamId]);

    return (
        <fetcher.Form method="post" style={{
            display: "grid",
            gridTemplateColumns: isTeamMode ? "28px 1fr 110px auto" : "28px 1fr auto",
            gap: 8,
            alignItems: "center",
            padding: "10px 12px",
            background: "var(--bg-fill-2)",
            borderRadius: "var(--r-cell)",
        }}>
            <input type="hidden" name="intent" value="update_player_setup" />
            <input type="hidden" name="playerId" value={player.id} />
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--green)", textAlign: "center" }}>{index + 1}</span>
            <input
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                style={{
                    width: "100%",
                    border: "1px solid var(--sep-opaque)",
                    borderRadius: "12px",
                    background: "white",
                    padding: "9px 12px",
                    fontSize: "0.88rem",
                    fontFamily: "inherit",
                    color: "var(--label)",
                    outline: "none",
                }}
            />
            {isTeamMode && (
                <select
                    name="teamId"
                    value={teamId}
                    onChange={(event) => setTeamId(event.target.value)}
                    style={{
                        width: "100%",
                        border: "1px solid var(--sep-opaque)",
                        borderRadius: "12px",
                        background: "white",
                        padding: "9px 12px",
                        fontSize: "0.84rem",
                        fontFamily: "inherit",
                        color: "var(--label)",
                        outline: "none",
                    }}
                >
                    {Array.from({ length: Math.max(teamOptions, Math.ceil((index + 1) / 2)) }, (_, optionIndex) => (
                        <option key={optionIndex} value={`team-${optionIndex + 1}`}>
                            Team {optionIndex + 1}
                        </option>
                    ))}
                </select>
            )}
            {!isTeamMode && <input type="hidden" name="teamId" value={player.teamId || ""} />}
            <button
                type="submit"
                disabled={isSaving || name.trim() === "" || (name.trim() === player.name && teamId === (player.teamId || fallbackTeam))}
                style={{
                    padding: "9px 12px",
                    borderRadius: "999px",
                    border: "none",
                    background: isSaving || name.trim() === "" || (name.trim() === player.name && teamId === (player.teamId || fallbackTeam)) ? "var(--sep-opaque)" : "var(--green)",
                    color: "white",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    cursor: isSaving || name.trim() === "" || (name.trim() === player.name && teamId === (player.teamId || fallbackTeam)) ? "not-allowed" : "pointer",
                }}
            >
                {isSaving ? "Saving" : "Save"}
            </button>
        </fetcher.Form>
    );
}

function DragTeamBoard({ players }) {
    const fetcher = useFetcher();
    const [orderedPlayers, setOrderedPlayers] = useState(players.map((player, index) => ({
        ...player,
        teamId: `team-${Math.floor(index / 2) + 1}`,
    })));
    const [dragIndex, setDragIndex] = useState(null);
    const isSaving = fetcher.state !== "idle";

    useEffect(() => {
        setOrderedPlayers(players.map((player, index) => ({
            ...player,
            teamId: `team-${Math.floor(index / 2) + 1}`,
        })));
    }, [players]);

    const movePlayer = (fromIndex, toIndex) => {
        if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;
        const next = [...orderedPlayers];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        setOrderedPlayers(next.map((player, index) => ({
            ...player,
            teamId: `team-${Math.floor(index / 2) + 1}`,
        })));
    };

    const shiftPlayer = (index, direction) => {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= orderedPlayers.length) return;
        movePlayer(index, nextIndex);
    };

    return (
        <fetcher.Form method="post">
            <input type="hidden" name="intent" value="update_team_assignments" />
            <input type="hidden" name="players" value={JSON.stringify(orderedPlayers.map((player) => ({
                id: player.id,
                name: player.name,
                teamId: player.teamId,
            })))} />
            <div style={{ display: "grid", gap: 10 }}>
                {orderedPlayers.map((player, index) => {
                    const teamIndex = Math.floor(index / 2);
                    const teamTone = getTeamColor(teamIndex);
                    const isTopOfTeam = index % 2 === 0;
                    return (
                        <div
                            key={player.id}
                            draggable
                            onDragStart={() => setDragIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                                movePlayer(dragIndex, index);
                                setDragIndex(null);
                            }}
                            onDragEnd={() => setDragIndex(null)}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "22px 64px 1fr 34px",
                                gap: 12,
                                alignItems: "center",
                                padding: "12px 14px",
                                borderRadius: "16px",
                                border: `1.5px solid ${teamTone.border}`,
                                background: teamTone.bg,
                                boxShadow: dragIndex === index ? "0 10px 30px rgba(28,79,53,0.16)" : "none",
                                transform: dragIndex === index ? "scale(1.01)" : "none",
                                transition: "transform 0.18s ease, box-shadow 0.18s ease",
                            }}
                        >
                            <div style={{ color: "var(--label-3)", fontSize: "1rem", cursor: "grab", textAlign: "center", userSelect: "none" }}>≡</div>
                            <div style={{
                                padding: "6px 8px",
                                borderRadius: "999px",
                                background: "rgba(255,255,255,0.72)",
                                color: teamTone.accent,
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                textAlign: "center",
                            }}>
                                Team {teamIndex + 1}
                            </div>
                            <div>
                                {isTopOfTeam && (
                                    <div style={{ fontSize: "0.62rem", color: "var(--label-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, fontWeight: 600 }}>
                                        {orderedPlayers[index + 1] ? `${player.name} + ${orderedPlayers[index + 1].name}` : player.name}
                                    </div>
                                )}
                                <input
                                    value={player.name}
                                    onChange={(event) => {
                                        const next = [...orderedPlayers];
                                        next[index] = { ...next[index], name: event.target.value };
                                        setOrderedPlayers(next);
                                    }}
                                    style={{
                                        width: "100%",
                                        border: "1px solid rgba(28,79,53,0.12)",
                                        borderRadius: "12px",
                                        background: "rgba(255,255,255,0.88)",
                                        padding: "10px 12px",
                                        fontSize: "0.9rem",
                                        fontFamily: "inherit",
                                        color: "var(--label)",
                                        outline: "none",
                                    }}
                                />
                            </div>
                            <div style={{ display: "grid", gap: 6 }}>
                                <button
                                    type="button"
                                    onClick={() => shiftPlayer(index, -1)}
                                    disabled={index === 0}
                                    aria-label={`Move ${player.name} up`}
                                    style={{
                                        width: 34,
                                        height: 28,
                                        borderRadius: "10px",
                                        border: "1px solid rgba(28,79,53,0.12)",
                                        background: index === 0 ? "rgba(255,255,255,0.44)" : "rgba(255,255,255,0.88)",
                                        color: index === 0 ? "var(--label-3)" : "var(--green)",
                                        cursor: index === 0 ? "not-allowed" : "pointer",
                                        fontSize: "0.9rem",
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        fontFamily: "inherit",
                                    }}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => shiftPlayer(index, 1)}
                                    disabled={index === orderedPlayers.length - 1}
                                    aria-label={`Move ${player.name} down`}
                                    style={{
                                        width: 34,
                                        height: 28,
                                        borderRadius: "10px",
                                        border: "1px solid rgba(28,79,53,0.12)",
                                        background: index === orderedPlayers.length - 1 ? "rgba(255,255,255,0.44)" : "rgba(255,255,255,0.88)",
                                        color: index === orderedPlayers.length - 1 ? "var(--label-3)" : "var(--green)",
                                        cursor: index === orderedPlayers.length - 1 ? "not-allowed" : "pointer",
                                        fontSize: "0.9rem",
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        fontFamily: "inherit",
                                    }}
                                >
                                    ↓
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--label-3)", lineHeight: 1.5 }}>
                    Drag players to reorder on desktop, or use the arrow controls on mobile. Every two adjacent rows become one fixed team.
                </div>
                <button
                    type="submit"
                    disabled={isSaving}
                    style={{
                        padding: "10px 16px",
                        borderRadius: "999px",
                        border: "none",
                        background: "var(--green)",
                        color: "white",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        cursor: isSaving ? "wait" : "pointer",
                    }}
                >
                    {isSaving ? "Saving" : "Save Teams"}
                </button>
            </div>
        </fetcher.Form>
    );
}

function CourtCard({ match, teamA, teamB, players, fetcher, pointsPerMatch, isHost }) {
    const [scoreA, setScoreA] = useState(match.scoreA ?? "");
    const [scoreB, setScoreB] = useState(match.scoreB ?? "");
    const isCompleted = match.status === "completed";

    const handleScoreAChange = (e) => {
        const val = e.target.value;
        setScoreA(val);
        if (val !== "" && !isNaN(parseInt(val, 10))) {
            const a = parseInt(val, 10);
            if (a >= 0 && a <= pointsPerMatch) setScoreB(String(pointsPerMatch - a));
        } else { setScoreB(""); }
    };

    const handleScoreBChange = (e) => {
        const val = e.target.value;
        setScoreB(val);
        if (val !== "" && !isNaN(parseInt(val, 10))) {
            const b = parseInt(val, 10);
            if (b >= 0 && b <= pointsPerMatch) setScoreA(String(pointsPerMatch - b));
        } else { setScoreA(""); }
    };

    const totalValid = scoreA !== "" && scoreB !== "" && parseInt(scoreA) + parseInt(scoreB) === pointsPerMatch;
    const setupTeams = buildTeams(players);
    const teamAEntry = findTeamEntry(teamA, setupTeams);
    const teamBEntry = findTeamEntry(teamB, setupTeams);

    return (
        <div style={{
            background: "var(--bg-card)",
            borderRadius: "var(--r-card)", overflow: "hidden",
            boxShadow: isCompleted ? "var(--shadow)" : "var(--shadow-md)",
            border: isCompleted ? "none" : "1.5px solid var(--sep-opaque)",
        }}>
            <div style={{
                background: isCompleted ? "var(--bg-fill-2)" : "var(--green)",
                color: isCompleted ? "var(--label-3)" : "white",
                padding: "8px 14px",
                fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
            }}>
                Court {match.court}
            </div>

            <div style={{ padding: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                            {teamAEntry?.label || "Team A"}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--label)" }}>{teamA.map((id) => getPlayerName(id, players)).join(" & ")}</div>
                    </div>
                    <div style={{ color: "var(--label-4)", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0 }}>vs</div>
                    <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                            {teamBEntry?.label || "Team B"}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--label)" }}>{teamB.map((id) => getPlayerName(id, players)).join(" & ")}</div>
                    </div>
                </div>

                {isCompleted ? (
                    <div style={{ textAlign: "center", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreA}</span>
                            <span style={{ color: "var(--label-4)", fontWeight: 700 }}>—</span>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreB}</span>
                        </div>
                        {match.scoreA === match.scoreB && (
                            <div style={{ fontSize: "0.7rem", color: "#8B7340", fontWeight: 600, marginTop: 4 }}>Draw</div>
                        )}
                    </div>
                ) : isHost ? (
                    <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="submit_score" />
                        <input type="hidden" name="matchId" value={match.id} />
                        <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.7rem", color: "var(--label-3)" }}>
                            Total = {pointsPerMatch} pts
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                            <input
                                type="number" name="scoreA" min="0" max={pointsPerMatch}
                                value={scoreA} onChange={handleScoreAChange} placeholder="0"
                                style={{
                                    width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                                    border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                    background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                                }}
                            />
                            <span style={{ color: "var(--label-3)", fontWeight: 700, fontSize: "1.2rem" }}>—</span>
                            <input
                                type="number" name="scoreB" min="0" max={pointsPerMatch}
                                value={scoreB} onChange={handleScoreBChange} placeholder="0"
                                style={{
                                    width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                                    border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                    background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                                }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={fetcher.state !== "idle" || !totalValid}
                            style={{
                                width: "100%", padding: "11px", borderRadius: "var(--r-cell)",
                                background: totalValid ? "var(--green)" : "var(--sep-opaque)",
                                color: "white", fontWeight: 600, fontSize: "0.9rem", border: "none",
                                cursor: totalValid ? "pointer" : "not-allowed", fontFamily: "inherit",
                                transition: "background 0.2s",
                            }}
                        >
                            Submit Score
                        </button>
                    </fetcher.Form>
                ) : (
                    <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
                        <div style={{ fontSize: "0.76rem", color: "var(--label-3)" }}>Score entry available to host only</div>
                    </div>
                )}
            </div>
        </div>
    );
}
