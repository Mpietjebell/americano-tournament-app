import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { loadTournament } from "../utils/tournament-actions.server";
import { getCountryDisplay, getPlacementLabel } from "../utils/tournament-helpers";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });

    // Player ID: prefer URL param (set at join time), fall back to cookie
    const url = new URL(request.url);
    const cookie = request.headers.get("Cookie") || "";
    const cookieMatch = cookie.match(new RegExp(`nopa_player_${params.id}=([^;]+)`));
    const playerId = url.searchParams.get("playerId") || cookieMatch?.[1] || null;

    // If no player identity at all, redirect to the join flow
    if (!playerId && tournament.joinCode) {
        return redirect(`/app/play/join/${tournament.joinCode}`);
    }

    return json({ tournament, playerId });
};

function getPlayerName(id, players) {
    return players.find((p) => p.id === id)?.name || "?";
}

export default function PlayerScoreboard() {
    const { tournament, playerId } = useLoaderData();
    const revalidator = useRevalidator();

    // Auto-refresh every 15 seconds
    useEffect(() => {
        const interval = setInterval(() => revalidator.revalidate(), 15000);
        return () => clearInterval(interval);
    }, [revalidator]);

    const players = tournament.players;
    const myPlayer = players.find(p => p.id === playerId);

    const allMatches = tournament.rounds.flatMap(r => r.matches.map(m => ({ ...m, roundNumber: r.roundNumber })));
    const completedMatches = allMatches.filter(m => m.status === "completed");
    const totalRounds = tournament.rounds.length;
    const isFinished = tournament.status === "finished";

    // Suspense: blank leaderboard for last 2 rounds
    const suspenseThreshold = Math.max(0, totalRounds - 2);
    const completedRounds = tournament.rounds.filter(r => r.status === "completed").length;
    const inSuspense = !isFinished && completedRounds >= suspenseThreshold && totalRounds > 2;

    // My upcoming matches (not yet completed, I'm in)
    const myUpcoming = allMatches.filter(m => {
        if (m.status === "completed" || !playerId) return false;
        const tA = JSON.parse(m.teamAIds);
        const tB = JSON.parse(m.teamBIds);
        return tA.includes(playerId) || tB.includes(playerId);
    });

    // My completed matches
    const myCompleted = allMatches.filter(m => {
        if (m.status !== "completed" || !playerId) return false;
        const tA = JSON.parse(m.teamAIds);
        const tB = JSON.parse(m.teamBIds);
        return tA.includes(playerId) || tB.includes(playerId);
    });

    const notStarted = totalRounds === 0;

    return (
        <>
            <nav className="ios-nav">
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: "0.72rem", opacity: 0.7, fontWeight: 500 }}>
                    {notStarted ? "Waiting to start" : "Live · 15s"}
                </span>
                <span style={{ minWidth: 60 }} />
            </nav>

            {/* Hero */}
            <div style={{
                height: 180,
                backgroundImage: "url(/player-portal.png)",
                backgroundSize: "cover",
                backgroundPosition: "center 15%",
                position: "relative",
            }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,79,53,0.25) 0%, rgba(0,0,0,0.6) 100%)" }} />
                <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center", padding: "0 20px" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.8rem", fontWeight: 400, color: "white", lineHeight: 1.1, textShadow: "0 2px 16px rgba(0,0,0,0.35)" }}>
                        {tournament.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                        {[tournament.location, getCountryDisplay(tournament.country)].filter(Boolean).join(" · ")}
                        {myPlayer && <span style={{ marginLeft: 10, background: "rgba(255,255,255,0.18)", padding: "2px 10px", borderRadius: 50, backdropFilter: "blur(4px)" }}>{myPlayer.name}</span>}
                    </div>
                </div>
            </div>

            <div className="ios-page">

                {/* Not started yet */}
                {notStarted && (
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", textAlign: "center", padding: "36px 24px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.4rem", color: "var(--label-2)", marginBottom: 8 }}>Waiting to start</div>
                        <p style={{ color: "var(--label-3)", fontSize: "0.85rem", maxWidth: 280, margin: "0 auto 20px", lineHeight: 1.6 }}>
                            The host hasn't activated rounds yet. This page refreshes automatically.
                        </p>
                        <div style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "12px 24px", display: "inline-block" }}>
                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>Players registered</div>
                            <div style={{ fontWeight: 700, fontSize: "1.6rem", color: "var(--green)" }}>{players.length}</div>
                        </div>
                    </div>
                )}

                {/* Progress bar */}
                {totalRounds > 0 && (
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "16px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--label-3)", marginBottom: 8 }}>
                            <span>{completedMatches.length} / {allMatches.length} matches</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 600, color: "var(--green)" }}>{Math.round((completedMatches.length / allMatches.length) * 100)}%</span>
                                <span style={{
                                    fontSize: "0.68rem", fontWeight: 600, padding: "2px 8px", borderRadius: "var(--r-pill)",
                                    background: isFinished ? "rgba(28,79,53,0.1)" : "rgba(197,165,90,0.12)",
                                    color: isFinished ? "var(--green)" : "#8B7340",
                                }}>{isFinished ? "Finished" : "Live"}</span>
                            </div>
                        </div>
                        <div style={{ height: 6, background: "var(--sep-opaque)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(completedMatches.length / allMatches.length) * 100}%`, background: "var(--green)", borderRadius: 3, transition: "width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--label-3)", marginTop: 6 }}>Round {completedRounds} / {totalRounds}</div>
                    </div>
                )}

                {/* My next match */}
                {myUpcoming.length > 0 && (
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "16px", marginBottom: 20, border: "2px solid var(--green)", boxShadow: "var(--shadow-md)" }}>
                        <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--green)", marginBottom: 12, fontWeight: 700 }}>
                            Your Next Match
                        </div>
                        {(() => {
                            const m = myUpcoming[0];
                            const tA = JSON.parse(m.teamAIds);
                            const tB = JSON.parse(m.teamBIds);
                            const iAmA = tA.includes(playerId);
                            const myTeam = iAmA ? tA : tB;
                            const oppTeam = iAmA ? tB : tA;
                            return (
                                <div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginBottom: 10 }}>Round {m.roundNumber} · Court {m.court}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                                        <div style={{ textAlign: "center", flex: 1 }}>
                                            <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "0.92rem" }}>{myTeam.map(id => getPlayerName(id, players)).join(" & ")}</div>
                                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginTop: 3 }}>You</div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: "var(--label-4)", fontSize: "0.78rem" }}>vs</div>
                                        <div style={{ textAlign: "center", flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--label)" }}>{oppTeam.map(id => getPlayerName(id, players)).join(" & ")}</div>
                                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginTop: 3 }}>Opponents</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Suspense or Leaderboard */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingLeft: 4 }}>
                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", fontWeight: 600 }}>
                            {isFinished ? "Final Leaderboard" : "Live Standings"}
                        </div>
                        {inSuspense && !isFinished && (
                            <span style={{ background: "var(--gold)", color: "white", fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: "var(--r-pill)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Suspense Mode
                            </span>
                        )}
                    </div>

                    {inSuspense && !isFinished ? (
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", textAlign: "center", padding: "32px 20px", boxShadow: "var(--shadow)" }}>
                            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.4rem", color: "var(--label-2)", marginBottom: 8 }}>Standings Hidden</div>
                            <p style={{ color: "var(--label-3)", fontSize: "0.85rem", maxWidth: 300, margin: "0 auto 20px", lineHeight: 1.6 }}>
                                Leaderboard locked for the final {totalRounds - suspenseThreshold} round(s).
                                Revealed when the host finishes.
                            </p>
                            <div style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "14px 24px", display: "inline-block" }}>
                                <div style={{ fontSize: "0.7rem", color: "var(--label-3)", marginBottom: 4 }}>Your score</div>
                                <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--green)" }}>{myPlayer?.totalPoints ?? "?"}</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                            {players.map((p, i) => {
                                const isMe = p.id === playerId;
                                return (
                                    <div key={p.id} style={{
                                        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                                        borderBottom: i < players.length - 1 ? "1px solid var(--sep)" : "none",
                                        background: isMe ? "rgba(28,79,53,0.06)" : undefined,
                                    }}>
                                        <div style={{ width: 22, textAlign: "center", fontSize: "0.82rem", flexShrink: 0, color: "var(--label-3)", fontWeight: 700 }}>
                                            {getPlacementLabel(i)}
                                        </div>
                                        <div style={{ flex: 1, fontWeight: isMe ? 700 : 500, fontSize: "0.9rem", color: isMe ? "var(--green)" : "var(--label)" }}>
                                            {p.name}
                                            {isMe && <span style={{ fontSize: "0.6rem", background: "var(--green)", color: "white", padding: "2px 6px", borderRadius: "var(--r-pill)", marginLeft: 6, fontWeight: 700 }}>You</span>}
                                        </div>
                                        <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--green)", minWidth: 32, textAlign: "right" }}>{p.totalPoints}</div>
                                        <div style={{ fontSize: "0.7rem", color: "var(--label-3)", minWidth: 60, textAlign: "right" }}>
                                            {p.matchesPlayed}P · {p.matchesWon}W
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* My recent results */}
                {myCompleted.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 10, fontWeight: 600, paddingLeft: 4 }}>
                            Your Results
                        </div>
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                            {myCompleted.slice(-5).reverse().map((m, mi, arr) => {
                                const tA = JSON.parse(m.teamAIds);
                                const tB = JSON.parse(m.teamBIds);
                                const iAmA = tA.includes(playerId);
                                const myScore = iAmA ? m.scoreA : m.scoreB;
                                const oppScore = iAmA ? m.scoreB : m.scoreA;
                                const won = myScore > oppScore;
                                const draw = myScore === oppScore;
                                return (
                                    <div key={m.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: mi < arr.length - 1 ? "1px solid var(--sep)" : "none", gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginBottom: 2 }}>R{m.roundNumber} · Court {m.court}</div>
                                            <div style={{ fontWeight: 500, fontSize: "0.85rem", color: "var(--label)" }}>vs {(iAmA ? tB : tA).map(id => getPlayerName(id, players)).join(" & ")}</div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontWeight: 700, fontSize: "1rem", color: won ? "var(--green)" : draw ? "var(--gold)" : "#c0392b", fontFamily: "monospace" }}>
                                                {myScore}–{oppScore}
                                            </div>
                                            <div style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", color: won ? "var(--green)" : draw ? "var(--gold)" : "#c0392b", letterSpacing: "0.05em", marginTop: 2 }}>
                                                {won ? "Win" : draw ? "Draw" : "Loss"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Final reveal */}
                {isFinished && (
                    <div style={{ background: "linear-gradient(135deg, var(--green-dark), var(--green))", color: "white", borderRadius: "var(--r-card)", padding: "28px 24px", textAlign: "center", boxShadow: "0 6px 24px rgba(28,79,53,0.35)" }}>
                        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.5rem", marginBottom: 4 }}>Tournament Complete!</div>
                        <p style={{ opacity: 0.8, fontSize: "0.85rem", marginBottom: 16 }}>The final results are published.</p>
                        <Link to={`/app/play/tournament/${tournament.id}/final`} style={{ textDecoration: "none" }}>
                            <button style={{ padding: "11px 24px", borderRadius: "var(--r-pill)", background: "white", color: "var(--green)", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                View Final Leaderboard
                            </button>
                        </Link>
                    </div>
                )}
            </div>
        </>
    );
}
