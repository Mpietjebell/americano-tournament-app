import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { loadTournament } from "../utils/tournament-actions.server";
import {
    buildTeams,
    buildJoinInviteText,
    DEUCE_LABELS,
    getCountryDisplay,
    getTournamentStats,
    TYPE_LABELS,
} from "../utils/tournament-helpers";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const origin = new URL(request.url).origin;
    return json({ tournament, origin });
};

export default function TournamentOverview() {
    const { tournament, origin } = useLoaderData();
    const [copied, setCopied] = useState(false);

    const courtNames = tournament.courtNames ? JSON.parse(tournament.courtNames) : [];
    const setupPlayers = tournament.setupPlayers || tournament.players;
    const stats = getTournamentStats({
        type: tournament.type,
        players: setupPlayers,
        courtsAvailable: tournament.courtsAvailable,
        pointsPerMatch: tournament.pointsPerMatch,
    });
    const isTeamMode = tournament.type === "team_americano" || tournament.type === "team_mexicano";
    const teams = isTeamMode ? buildTeams(setupPlayers) : [];
    const joinUrl = `${origin}/app/play/join/${tournament.joinCode}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(joinUrl)}&size=220x220&margin=10&color=1C4F35`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(buildJoinInviteText(tournament, joinUrl))}`;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <nav className="ios-nav">
                <Link to="/app/play" className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Home
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <Link to={`/app/play/tournament/${tournament.id}`} className="ios-nav-action">Manager</Link>
            </nav>

            <div className="ios-page">
                <div style={{
                    height: 190,
                    borderRadius: "var(--r-card)",
                    overflow: "hidden",
                    position: "relative",
                    marginBottom: 20,
                    backgroundImage: `linear-gradient(to bottom, rgba(28,79,53,0.18), rgba(21,61,41,0.74)), url(/hero-court.png)`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    boxShadow: "var(--shadow-md)",
                }}>
                    <div style={{ position: "absolute", left: 20, right: 20, bottom: 20 }}>
                        <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.72)", fontWeight: 600, marginBottom: 8 }}>
                            Tournament Created
                        </div>
                        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontWeight: 400, fontSize: "2rem", color: "white", lineHeight: 1, marginBottom: 6 }}>
                            {tournament.name}
                        </h1>
                        <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.8)" }}>
                            {tournament.location || "Venue TBC"} · {getCountryDisplay(tournament.country)}
                        </div>
                    </div>
                </div>

                <div style={{ display: "grid", gap: 20 }}>
                    <section style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 18, boxShadow: "var(--shadow)" }}>
                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 14, fontWeight: 600 }}>
                            Format
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            {[
                                { label: "Mode", value: TYPE_LABELS[tournament.type] || tournament.type },
                                { label: "Points", value: `${tournament.pointsPerMatch} pts` },
                                { label: "Deuce", value: DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod },
                                { label: "Visibility", value: tournament.isPublic ? "Public" : "Private" },
                            ].map((item) => (
                                <div key={item.label} style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "12px 14px" }}>
                                    <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>{item.label}</div>
                                    <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--green)" }}>{item.value}</div>
                                </div>
                            ))}
                        </div>
                        {stats && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--sep)" }}>
                                {[
                                    { label: "Rounds", value: stats.totalRounds },
                                    { label: "Matches", value: stats.totalMatches },
                                    { label: stats.formatKind === "team" ? "Per Team" : "Per Player", value: stats.matchesPerEntry },
                                    { label: "Duration", value: stats.duration },
                                ].map((item) => (
                                    <div key={item.label} style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--green)" }}>{item.value}</div>
                                        <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginTop: 4, fontWeight: 600 }}>{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 18, boxShadow: "var(--shadow)" }}>
                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 14, fontWeight: 600 }}>
                            Courts
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {Array.from({ length: tournament.courtsAvailable }, (_, index) => (
                                <span key={index} style={{ background: "var(--green)", color: "white", borderRadius: "var(--r-pill)", padding: "7px 14px", fontSize: "0.8rem", fontWeight: 600 }}>
                                    {courtNames[index] || `Court ${index + 1}`}
                                </span>
                            ))}
                        </div>
                    </section>

                    <section style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 18, boxShadow: "var(--shadow)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", fontWeight: 600 }}>
                                {isTeamMode ? "Teams" : "Player List"}
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "var(--green)", fontWeight: 700 }}>
                                {isTeamMode ? `${teams.length} teams` : `${tournament.players.length} players`}
                            </div>
                        </div>
                        {isTeamMode ? (
                            <div style={{ display: "grid", gap: 8 }}>
                                {teams.map((team) => (
                                    <div key={team.id} style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "10px 12px" }}>
                                        <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>{team.label}</div>
                                        <div style={{ fontSize: "0.86rem", color: "var(--label-2)", fontWeight: 600 }}>
                                            {team.players.map((player) => player.name).join(" & ")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {tournament.players.map((player, index) => (
                                    <span key={player.id} style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-pill)", padding: "6px 12px", fontSize: "0.8rem", color: "var(--label-2)", fontWeight: 500 }}>
                                        {index + 1}. {player.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    <section style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 18, boxShadow: "var(--shadow)" }}>
                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 14, fontWeight: 600 }}>
                            Share
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "stretch" }}>
                            <div style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-card)", padding: "16px 18px" }}>
                                <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Join Code</div>
                                <div style={{ fontFamily: "monospace", fontSize: "2rem", letterSpacing: "0.22em", fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>
                                    {tournament.joinCode}
                                </div>
                                <div style={{ fontSize: "0.76rem", color: "var(--label-3)", lineHeight: 1.5 }}>
                                    Share the code or send the direct player link below.
                                </div>
                            </div>
                            <div style={{ background: "white", borderRadius: "var(--r-card)", padding: 12, border: "1px solid var(--sep)" }}>
                                <img src={qrUrl} alt="Tournament join QR code" style={{ width: 132, height: 132, display: "block", borderRadius: "var(--r-cell)" }} />
                            </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                            <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", background: "#25D366", color: "white", borderRadius: "var(--r-card)", fontWeight: 600, fontSize: "0.92rem" }}>
                                    Share on WhatsApp
                                </div>
                            </a>
                            <button type="button" onClick={handleCopy} style={{ padding: "14px 16px", borderRadius: "var(--r-card)", background: copied ? "rgba(28,79,53,0.06)" : "var(--bg-fill-2)", color: copied ? "var(--green)" : "var(--label)", border: `1px solid ${copied ? "var(--green)" : "var(--sep)"}`, fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
                                {copied ? "Link Copied" : "Copy Join Link"}
                            </button>
                            <div style={{ fontSize: "0.74rem", color: "var(--label-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{joinUrl}</div>
                        </div>
                    </section>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={`/app/play/tournament/${tournament.id}/print.pdf`} download style={{ textDecoration: "none", flex: 1 }}>
                            <button style={{ width: "100%", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--bg-card)", color: "var(--label)", border: "1px solid var(--sep)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow)" }}>
                                Download Schedule PDF
                            </button>
                        </a>
                        <Link to={`/app/play/tournament/${tournament.id}`} style={{ textDecoration: "none", flex: 1 }}>
                            <button style={{ width: "100%", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(28,79,53,0.24)" }}>
                                Open Match Manager
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
        </>
    );
}
