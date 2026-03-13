import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { loadTournament } from "../utils/tournament-actions.server";
import { getCountryDisplay } from "../utils/tournament-helpers";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const origin = new URL(request.url).origin;
    return json({ tournament, origin });
};

export const meta = ({ data }) => [
    { title: data?.tournament ? `${data.tournament.name} — Match Schedule` : "Print Schedule" },
];

const DEUCE_LABELS = { deuce: "Deuce", golden_point: "Golden Point", starpoint: "Starpoint", tie_break: "Tie Break" };
const TYPE_LABELS = {
  americano: "Americano",
  mexicano: "Mexicano",
  mixicano: "Mixicano",
  team_americano: "Team Americano",
  team_mexicano: "Team Mexicano",
  king_of_the_court: "King of the Court",
  beat_the_box: "Beat the Box",
};

function getPlayerName(id, players) {
    return players.find(p => p.id === id)?.name || "?";
}

function CourtColumn({ courtNumber, courtName, rounds, players }) {
    const courtMatches = rounds.map(r => ({
        roundNumber: r.roundNumber,
        match: r.matches.find(m => m.court === courtNumber),
    })).filter(r => r.match);

    return (
        <div className="pp-court-col">
            <div className="pp-court-header">{courtName || `Court ${courtNumber}`}</div>
            {courtMatches.map(({ roundNumber, match }) => {
                const tA = JSON.parse(match.teamAIds);
                const tB = JSON.parse(match.teamBIds);
                return (
                    <div key={match.id} className="pp-match-box">
                        <div className="pp-round-label">Round {roundNumber}</div>
                        <div className="pp-teams">
                            {[tA, tB].map((team, ti) => (
                                <div key={ti} className={`pp-team pp-team-${ti === 0 ? "a" : "b"}`}>
                                    {team.map(pid => (
                                        <div key={pid} className="pp-player">
                                            <div className="pp-avatar" />
                                            <span>{getPlayerName(pid, players)}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
            {courtMatches.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px", fontSize: "0.65rem", color: "#aaa" }}>
                    No rounds scheduled yet
                </div>
            )}
        </div>
    );
}

const PRINT_STYLES = `
    .pp-root * { box-sizing: border-box; }
    .pp-root { font-family: 'Inter', -apple-system, sans-serif; color: #111; }

    .pp-toolbar {
        background: #1C4F35; color: white;
        padding: 12px 24px; display: flex; align-items: center; gap: 16px;
    }
    .pp-toolbar button {
        background: white; color: #1C4F35; border: none;
        padding: 9px 22px; border-radius: 50px; font-weight: 700;
        cursor: pointer; font-size: 0.88rem;
    }
    .pp-toolbar-link {
        background: white; color: #1C4F35; border: none;
        padding: 9px 22px; border-radius: 50px; font-weight: 700;
        font-size: 0.88rem; text-decoration: none; display: inline-block;
    }
    .pp-toolbar span { color: rgba(255,255,255,0.8); font-size: 0.82rem; }

    .pp-page {
        width: 297mm; min-height: 210mm;
        padding: 12mm 14mm;
        display: flex; flex-direction: column;
        page-break-after: always; background: white;
    }
    .pp-page:last-child { page-break-after: auto; }

    .pp-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        padding-bottom: 10px; border-bottom: 2px solid #1C4F35; margin-bottom: 12px;
    }

    .pp-rules { flex: 0 0 200px; font-size: 0.6rem; line-height: 1.8; }
    .pp-rules h4 { font-size: 0.65rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; color: #1C4F35; }

    .pp-center { flex: 1; text-align: center; padding: 0 12px; }
    .pp-event-logo { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; margin: 0 auto 6px; display: block; }
    .pp-event-name { font-size: 1.15rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: #1C4F35; }
    .pp-event-sub { font-size: 0.58rem; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-top: 3px; }

    .pp-qr { flex: 0 0 150px; display: flex; align-items: flex-start; gap: 8px; justify-content: flex-end; }
    .pp-qr img { width: 76px; height: 76px; flex-shrink: 0; }
    .pp-qr-text { font-size: 0.58rem; color: #333; font-weight: 600; line-height: 1.5; }
    .pp-nopa-word { font-size: 1rem; font-weight: 900; letter-spacing: 0.1em; color: #1C4F35; }
    .pp-join-code { font-weight: 900; letter-spacing: 0.15em; font-size: 0.72rem; color: #1C4F35; margin-top: 5px; }

    .pp-players-row {
        display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;
        padding: 6px 8px; background: #f9f9f9; border-radius: 6px;
        font-size: 0.58rem; font-weight: 600; border: 1px solid #eee;
    }
    .pp-player-chip {
        background: white; border: 1px solid #ddd; border-radius: 50px;
        padding: 2px 8px; display: flex; align-items: center; gap: 4px;
    }
    .pp-chip-dot { width: 10px; height: 10px; border-radius: 50%; background: #e0e0e0; border: 1px solid #ccc; flex-shrink: 0; }

    .pp-courts-row { display: flex; gap: 12px; flex: 1; }
    .pp-court-col { flex: 1; display: flex; flex-direction: column; }
    .pp-court-header {
        text-align: center; font-weight: 900; font-size: 0.82rem;
        letter-spacing: 0.12em; text-transform: uppercase;
        padding-bottom: 7px; margin-bottom: 7px;
        border-bottom: 2px solid #1C4F35; color: #1C4F35;
    }

    .pp-match-box { border: 1px solid #ccc; border-radius: 6px; margin-bottom: 6px; overflow: hidden; }
    .pp-round-label {
        background: #f5f5f5; padding: 3px 8px; font-size: 0.52rem;
        font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
        color: #666; border-bottom: 1px solid #ddd;
    }
    .pp-teams { display: grid; grid-template-columns: 1fr 1fr; }
    .pp-team { padding: 5px 7px; }
    .pp-team-a { border-right: 1px solid #eee; background: white; }
    .pp-team-b { background: #fafafa; }
    .pp-player { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; font-size: 0.58rem; font-weight: 600; }
    .pp-avatar { width: 18px; height: 18px; border-radius: 50%; background: #e8e8e8; border: 1px solid #ccc; flex-shrink: 0; }

    .pp-score-row {
        display: flex; gap: 6px; padding: 4px 7px; border-top: 1px solid #eee;
        font-size: 0.6rem; font-weight: 700; color: #1C4F35;
    }
    .pp-score-box { width: 28px; height: 18px; border: 1px solid #ccc; border-radius: 3px; background: white; }

    @media print {
        @page { size: A4 landscape; margin: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .pp-toolbar { display: none !important; }
        .pp-root { background: white; }
    }
    @media screen {
        .pp-root { background: #e8e8e8; min-height: 100vh; }
        .pp-page { margin: 20px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    }
`;

export default function PrintView() {
    const { tournament, origin } = useLoaderData();

    const players = tournament.players;
    const rounds = tournament.rounds;
    const courtNames = tournament.courtNames ? JSON.parse(tournament.courtNames) : [];
    const numCourts = tournament.courtsAvailable;
    const joinUrl = tournament.joinCode ? `${origin}/app/play/join/${tournament.joinCode}` : origin;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(joinUrl)}&size=160x160&margin=4&color=1C4F35`;

    // Chunk courts into groups of 3 per printed page
    const courtPages = [];
    for (let i = 0; i < numCourts; i += 3) {
        courtPages.push([i + 1, i + 2, i + 3].filter(n => n <= numCourts));
    }

    return (
        <div className="pp-root">
            <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

            <div className="pp-toolbar">
                <a href={`/app/play/tournament/${tournament.id}/print.pdf`} download className="pp-toolbar-link">Download PDF</a>
                <Link to={`/app/play/tournament/${tournament.id}`} style={{ color: "white", fontSize: "0.85rem", textDecoration: "none" }}>
                    Back to tournament
                </Link>
                <span>
                    {courtPages.length} page{courtPages.length > 1 ? "s" : ""} · {numCourts} courts · {rounds.length} rounds · {players.length} players
                    {rounds.length === 0 && " · Start the tournament first to generate rounds"}
                </span>
            </div>

            {/* Printable pages */}
            {courtPages.map((pageCourts, pageIndex) => (
                <div key={pageIndex} className="pp-page">
                    {/* Page header */}
                    <div className="pp-header">
                        {/* Rules */}
                        <div className="pp-rules">
                            <h4>Rules</h4>
                            <div><strong>Game mode:</strong> {TYPE_LABELS[tournament.type] || tournament.type}</div>
                            <div><strong>Points:</strong> {tournament.pointsPerMatch}</div>
                            <div><strong>40:40:</strong> {DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod}</div>
                            <div><strong>Courts:</strong> {pageCourts.map(n => courtNames[n - 1] || `Court ${n}`).join(", ")}</div>
                            <div><strong>Players:</strong> {players.length}</div>
                        </div>

                        {/* Center — Event name + logo */}
                        <div className="pp-center">
                            {tournament.logoUrl
                                ? <img src={tournament.logoUrl} alt="Logo" className="pp-event-logo" />
                                : <div style={{ fontSize: "0.74rem", marginBottom: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1C4F35", fontWeight: 700 }}>{getCountryDisplay(tournament.country)}</div>
                            }
                            <div className="pp-event-name">{tournament.name}</div>
                            <div className="pp-event-sub">{[tournament.location, "by NOPA Padel"].filter(Boolean).join(" · ")}</div>
                        </div>

                        {/* QR + code */}
                        <div className="pp-qr">
                            <div className="pp-qr-text">
                                <div className="pp-nopa-word">NOPA</div>
                                <div style={{ marginTop: 4, lineHeight: 1.5 }}>
                                    Follow the score<br />scan or visit<br /><strong>"The Clubhouse"</strong>
                                </div>
                                {tournament.joinCode && (
                                    <div className="pp-join-code">{tournament.joinCode}</div>
                                )}
                            </div>
                            <img src={qrUrl} alt="QR Code" />
                        </div>
                    </div>

                    {/* Player roster */}
                    <div className="pp-players-row">
                        {players.map((p, i) => (
                            <div key={p.id} className="pp-player-chip">
                                <div className="pp-chip-dot" />
                                {i + 1}. {p.name}
                            </div>
                        ))}
                    </div>

                    {/* Courts */}
                    <div className="pp-courts-row">
                        {pageCourts.map(courtNum => (
                            <CourtColumn
                                key={courtNum}
                                courtNumber={courtNum}
                                courtName={courtNames[courtNum - 1]}
                                rounds={rounds}
                                players={players}
                            />
                        ))}
                        {/* Fill empty slots to keep 3-column layout */}
                        {pageCourts.length < 3 && Array.from({ length: 3 - pageCourts.length }).map((_, i) => (
                            <div key={`empty-${i}`} style={{ flex: 1 }} />
                        ))}
                    </div>
                </div>
            ))}

            {courtPages.length === 0 && (
                <div className="pp-page" style={{ alignItems: "center", justifyContent: "center" }}>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
                        <h2 style={{ color: "#1C4F35", marginBottom: 8 }}>{tournament.name}</h2>
                        <p style={{ color: "#666" }}>No courts configured. Go back and set up courts.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
