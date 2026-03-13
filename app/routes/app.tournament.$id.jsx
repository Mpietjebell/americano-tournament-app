import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { loadTournament, generateAllRounds, submitScore } from "../utils/tournament-actions.server";
import { createHostCookie } from "../utils/host-auth.server";

export const loader = async ({ request, params }) => {
    await authenticate.admin(request);
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    return json(
        { tournament, isHost: true },
        {
            headers: {
                "Set-Cookie": createHostCookie(tournament.id, tournament.hostToken),
            },
        },
    );
};

export const action = async ({ request, params }) => {
    await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    const tournament = await loadTournament(params.id);

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
        return json(
            { success: true },
            {
                headers: {
                    "Set-Cookie": createHostCookie(tournament.id, tournament.hostToken),
                },
            },
        );
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

function getPlayerName(id, players) {
    return players.find((p) => p.id === id)?.name || "Unknown";
}

export default function TournamentView() {
    const { tournament, isHost } = useLoaderData();
    const fetcher = useFetcher();
    const [activeTab, setActiveTab] = useState("courts");

    const players = tournament.players;
    const hasRounds = tournament.rounds.length > 0;

    const allMatches = tournament.rounds.flatMap((r) => r.matches);
    const completedMatches = allMatches.filter((m) => m.status === "completed");
    const pendingMatches = allMatches.filter((m) => m.status !== "completed");
    const isFinished = hasRounds && pendingMatches.length === 0 && completedMatches.length > 0;

    return (
        <div className="nopa-app">
            <link rel="stylesheet" href="/app/styles/nopa-theme.css" />
            <div className="nopa-topbar">
                <h1>NOPA Padel</h1>
                <Link to="/app" style={{ color: "white", textDecoration: "none", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    ← Back
                </Link>
            </div>
            <div className="nopa-page">
                <div className="nopa-page-header">
                    <h2 className="nopa-title">{tournament.name}</h2>
                    <p>
                        {tournament.type.replace("_", " ").toUpperCase()} · {players.length} players · {tournament.courtsAvailable} courts ·{" "}
                        <span className={`nopa-badge nopa-badge-${tournament.status}`}>{tournament.status}</span>
                    </p>
                    {hasRounds && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--nopa-text-muted)", marginBottom: 4 }}>
                                <span>{completedMatches.length} / {allMatches.length} matches</span>
                                <span>{Math.round((completedMatches.length / allMatches.length) * 100)}%</span>
                            </div>
                            <div style={{ height: 6, background: "var(--nopa-border)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(completedMatches.length / allMatches.length) * 100}%`, background: "var(--nopa-green)", borderRadius: 3, transition: "width 0.3s ease" }} />
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <button className={`nopa-btn nopa-btn-small ${activeTab === "courts" ? "nopa-btn-primary" : "nopa-btn-secondary"}`} onClick={() => setActiveTab("courts")}>
                        Courts {pendingMatches.length > 0 && `(${pendingMatches.length})`}
                    </button>
                    <button className={`nopa-btn nopa-btn-small ${activeTab === "leaderboard" ? "nopa-btn-primary" : "nopa-btn-secondary"}`} onClick={() => setActiveTab("leaderboard")}>
                        Leaderboard
                    </button>
                </div>

                {activeTab === "courts" && (
                    <>
                        {!hasRounds && isHost && (
                            <div style={{ textAlign: "center", marginBottom: 24 }}>
                                <fetcher.Form method="post">
                                    <input type="hidden" name="intent" value="generate_all_rounds" />
                                    <button type="submit" className="nopa-btn nopa-btn-primary" disabled={fetcher.state !== "idle"}>
                                        {fetcher.state !== "idle" ? "Generating All Matches..." : `Generate All ${players.length - 1} Rounds`}
                                    </button>
                                </fetcher.Form>
                            </div>
                        )}

                        {tournament.rounds.map((round) => {
                            const roundCompleted = round.matches.every((m) => m.status === "completed");
                            const roundActive = round.matches.some((m) => m.status === "completed");
                            return (
                                <div key={round.id} style={{ marginBottom: 32 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                        <h3 className="nopa-title" style={{ fontSize: "1rem", margin: 0 }}>Round {round.roundNumber}</h3>
                                        <span className={`nopa-badge nopa-badge-${roundCompleted ? "completed" : roundActive ? "active" : "setup"}`}>
                                            {roundCompleted ? "✓ Done" : roundActive ? "In Progress" : "Pending"}
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

                        {!isHost && (
                            <div className="nopa-card" style={{ marginTop: 12 }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>Read-only view</div>
                                <div style={{ fontSize: "0.85rem", color: "var(--label-3)" }}>
                                    Host controls are only available from the authenticated admin flow.
                                </div>
                            </div>
                        )}

                        {isFinished && (
                            <div style={{ background: "var(--nopa-green)", color: "white", borderRadius: "var(--nopa-radius)", padding: "24px", textAlign: "center", marginTop: 16 }}>
                                <div style={{ fontSize: "1.5rem", marginBottom: 4 }}>🏆</div>
                                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 4 }}>Tournament Complete!</h3>
                                <p style={{ opacity: 0.8, fontSize: "0.85rem" }}>{completedMatches.length} matches played</p>
                                <button className="nopa-btn nopa-btn-small" style={{ background: "white", color: "var(--nopa-green)", marginTop: 12 }} onClick={() => setActiveTab("leaderboard")}>
                                    View Final Leaderboard →
                                </button>
                            </div>
                        )}
                    </>
                )}

                {activeTab === "leaderboard" && (
                    <div className="nopa-card">
                        <h3 className="nopa-title" style={{ marginBottom: 16 }}>{isFinished ? "Final Standings" : "Live Leaderboard"}</h3>
                        <table className="nopa-leaderboard">
                            <thead>
                                <tr><th>#</th><th>Player</th><th>Pts</th><th>P</th><th>W</th><th>D</th><th>L</th></tr>
                            </thead>
                            <tbody>
                                {players.map((p, i) => {
                                    const losses = p.matchesPlayed - p.matchesWon - (p.matchesDrawn || 0);
                                    return (
                                        <tr key={p.id}>
                                            <td className={`nopa-rank ${i < 3 ? `nopa-rank-${i + 1}` : ""}`}>
                                                {i === 0 && isFinished ? "🥇" : i === 1 && isFinished ? "🥈" : i === 2 && isFinished ? "🥉" : i + 1}
                                            </td>
                                            <td className="nopa-player-name-cell">{p.name}</td>
                                            <td className="nopa-points-cell">{p.totalPoints}</td>
                                            <td>{p.matchesPlayed}</td>
                                            <td>{p.matchesWon}</td>
                                            <td>{p.matchesDrawn || 0}</td>
                                            <td>{losses}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
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

    return (
        <div className="nopa-court-card">
            <div className="nopa-court-header">Court {match.court}</div>
            <div className="nopa-court-body">
                <div className="nopa-court-matchup">
                    <div className="nopa-court-team">
                        <div className="nopa-court-team-label">Team A</div>
                        <div className="nopa-court-team-names">{teamA.map((id) => getPlayerName(id, players)).join(" & ")}</div>
                    </div>
                    <div className="nopa-court-vs">VS</div>
                    <div className="nopa-court-team">
                        <div className="nopa-court-team-label">Team B</div>
                        <div className="nopa-court-team-names">{teamB.map((id) => getPlayerName(id, players)).join(" & ")}</div>
                    </div>
                </div>

                {isCompleted ? (
                    <div style={{ textAlign: "center", padding: "8px 0" }}>
                        <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--nopa-green)" }}>{match.scoreA}</span>
                        <span style={{ margin: "0 12px", color: "var(--nopa-text-muted)" }}>—</span>
                        <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--nopa-green)" }}>{match.scoreB}</span>
                        <div style={{ marginTop: 4 }}>
                            <span className="nopa-badge nopa-badge-completed">✓</span>
                        </div>
                    </div>
                ) : isHost ? (
                    <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="submit_score" />
                        <input type="hidden" name="matchId" value={match.id} />
                        <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.75rem", color: "var(--nopa-text-muted)" }}>
                            Total must equal {pointsPerMatch} points
                        </div>
                        <div className="nopa-score-input-group">
                            <input className="nopa-score-input" type="number" name="scoreA" min="0" max={pointsPerMatch} value={scoreA} onChange={handleScoreAChange} placeholder="0" />
                            <span className="nopa-score-dash">—</span>
                            <input className="nopa-score-input" type="number" name="scoreB" min="0" max={pointsPerMatch} value={scoreB} onChange={handleScoreBChange} placeholder="0" />
                        </div>
                        <div style={{ textAlign: "center", marginTop: 12 }}>
                            <button type="submit" className="nopa-btn nopa-btn-primary nopa-btn-small" disabled={fetcher.state !== "idle" || !totalValid}>
                                Submit Score
                            </button>
                        </div>
                    </fetcher.Form>
                ) : (
                    <div style={{ textAlign: "center", padding: "12px 0", fontSize: "0.8rem", color: "var(--label-3)" }}>
                        Match pending
                    </div>
                )}
            </div>
        </div>
    );
}
