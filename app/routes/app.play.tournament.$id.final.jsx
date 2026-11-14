import { json } from "@remix-run/node";
import { NopaBanner } from "../components/NopaBanner";
import { useLoaderData, Link, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { Confetti, CountUp } from "../components/Celebration";
import { Avatar } from "../components/Avatar";
import { getPlayerAvatars } from "../utils/avatar.server";
import { toPng } from "html-to-image";
import { loadTournament } from "../utils/tournament-actions.server";
import { viewerTournament, buildResultsShareText, buildTeamStandings, getCountryDisplay, getPlacementLabel, getTeamColor } from "../utils/tournament-helpers";
import { getHostTokenFromRequest } from "../utils/host-auth.server";
import { getRequestOrigin } from "../utils/request.server";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const origin = getRequestOrigin(request);
    const hostToken = getHostTokenFromRequest(request, params.id);
    const isHost = Boolean(hostToken && hostToken === tournament.hostToken);
    return json({ tournament: viewerTournament(tournament, { isHost }), origin, isHost, avatars: await getPlayerAvatars(tournament.id) });
};

export const meta = ({ data }) => {
    if (!data?.tournament) return [{ title: "Tournament Results" }];
    const t = data.tournament;
    const isTeamMode = t.type === "team_americano" || t.type === "team_mexicano";
    const standings = isTeamMode ? buildTeamStandings(t.players) : t.players;
    const top3 = standings.slice(0, 3).map((p, i) => `${i + 1}. ${p.name} (${p.totalPoints} pts)`).join("  ");
    const desc = `${top3} — ${t.rounds.length} rounds · ${t.players.length} players${isTeamMode ? ` · ${standings.length} teams` : ""} · NOPA Padel`;
    const image = t.logoUrl && t.logoUrl.startsWith("http") ? t.logoUrl : `${data.origin}/images/brand/clubhouse-table.jpg`;
    const url = `${data.origin}/app/play/tournament/${t.id}/final`;
    return [
        { title: `${t.name} — Final Results` },
        { name: "description", content: desc },
        { property: "og:title", content: `${t.name} — Final Results` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${t.name} — Final Results` },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
    ];
};

function copyText(text, onSuccess) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => execCopy(text, onSuccess));
    } else {
        execCopy(text, onSuccess);
    }
}
function execCopy(text, onSuccess) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(el);
    el.select();
    try { document.execCommand("copy"); onSuccess?.(); } catch { /* silent */ }
    document.body.removeChild(el);
}

export default function FinalLeaderboard() {
    const { tournament, origin, isHost, avatars } = useLoaderData();
    const [copied, setCopied] = useState(false);
    const [releasedNow, setReleasedNow] = useState(false);
    const released = tournament.resultsPublished || releasedNow;
    const revalidator = useRevalidator();

    // Players waiting for the host: check every few seconds so the results
    // appear on their phone by themselves the moment they are released.
    useEffect(() => {
        if (isHost || released) return;
        const interval = setInterval(() => revalidator.revalidate(), 4000);
        return () => clearInterval(interval);
    }, [isHost, released, revalidator]);

    // Celebrate once per person per tournament: when the host releases, when
    // the results arrive on a waiting player's phone, or on a first visit.
    const [celebrate, setCelebrate] = useState(0);
    const wasReleased = useRef(released);
    useEffect(() => {
        const key = `nopa_celebrated_${tournament.id}`;
        let seen = false;
        try { seen = sessionStorage.getItem(key) === "1"; } catch { /* private mode */ }
        const justReleased = released && !wasReleased.current;
        wasReleased.current = released;
        if (released && (justReleased || !seen)) {
            setCelebrate((n) => n + 1);
            try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
        }
    }, [released, tournament.id]);
    const [imageState, setImageState] = useState("idle"); // idle | generating | error
    const releaseFetcher = useFetcher();

    const players = tournament.players;
    const isTeamMode = tournament.type === "team_americano" || tournament.type === "team_mexicano";
    const teamStandings = isTeamMode ? buildTeamStandings(players) : [];
    const standings = isTeamMode ? teamStandings : players;
    const allMatches = tournament.rounds.flatMap(r => r.matches);
    const totalMatches = allMatches.filter(m => m.status === "completed").length;

    const mvp = standings[0];
    const podiumColors = ["var(--gold)", "#8C8C8C", "#CD7F32"];

    const typeLabels = {
        americano: "Americano",
        mexicano: "Mexicano",
        mixicano: "Mixicano",
        team_americano: "Team Americano",
        team_mexicano: "Team Mexicano",
        king_of_the_court: "King of the Court",
        beat_the_box: "Beat the Box",
    };

    const pageUrl = `${origin}/app/play/tournament/${tournament.id}/final`;
    const shareText = buildResultsShareText(tournament, standings, pageUrl);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    const finish = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    const handleCopyLink = () => copyText(pageUrl, finish);

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: `${tournament.name} — Results`, text: shareText, url: pageUrl });
            } catch { /* user cancelled */ }
        } else {
            window.open(waUrl, "_blank");
        }
    };

    const handleReleaseResults = () => {
        releaseFetcher.submit({}, { method: "post", action: `/api/tournament/${tournament.id}/release-results` });
        setReleasedNow(true);
    };

    // Renders the branded scorecard (#final-card) to a PNG so it can go
    // straight into WhatsApp as an image, not just a link — using the
    // native share sheet with the file attached where the browser
    // supports it (most mobile browsers), and falling back to a plain
    // download the host can attach manually otherwise.
    const handleShareImage = async () => {
        const node = document.getElementById("final-card");
        if (!node) return;
        setImageState("generating");
        try {
            const dataUrl = await toPng(node, { pixelRatio: 2 });
            const fileName = `${tournament.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nopa-results"}.png`;

            if (navigator.canShare && navigator.share) {
                const blob = await (await fetch(dataUrl)).blob();
                const file = new File([blob], fileName, { type: "image/png" });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: `${tournament.name} — Results`, text: shareText });
                    setImageState("idle");
                    return;
                }
            }

            // No file-sharing support — download the image, then hand off
            // to WhatsApp so it's one tap away to attach.
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.open(waUrl, "_blank");
            setImageState("idle");
        } catch {
            setImageState("error");
            setTimeout(() => setImageState("idle"), 3000);
        }
    };

    if (!isHost && !released) {
        return (
            <>
                <nav className="ios-nav">
                    <Link to={`/app/play/tournament/${tournament.id}`} className="ios-nav-back">
                        <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Back
                    </Link>
                    <span className="ios-nav-brand">NOPA</span>
                    <span style={{ minWidth: 60 }} />
                </nav>
                <div className="ios-page" style={{ maxWidth: 640, textAlign: "center", paddingTop: 80 }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--label)", marginBottom: 8 }}>Results not released yet</div>
                    <div style={{ fontSize: "0.88rem", color: "var(--label-3)" }}>All matches are played. The results appear here by themselves as soon as the host releases them.</div>
                </div>
            </>
        );
    }

    return (
        <>
            <nav className="ios-nav">
                <Link to={`/app/play/tournament/${tournament.id}`} className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Back
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>
            <Confetti fire={celebrate} />
            {/* key: replaying the celebration restarts every entrance animation */}
            <div className={`ios-page ${celebrate ? "nopa-celebrate" : ""}`} key={celebrate} style={{ maxWidth: 640 }}>

                {/* ── Shareable result card ── */}
                <div id="final-card" className="nopa-reveal-card" style={{
                    background: "linear-gradient(145deg, var(--green-dark), var(--green))",
                    borderRadius: 0, padding: "40px 32px", color: "white", textAlign: "center", marginBottom: 8,
                    boxShadow: "0 8px 40px rgba(28,79,53,0.35)",
                }}>
                    {/* NOPA branding */}
                    <div style={{ fontSize: "0.65rem", letterSpacing: "0.25em", opacity: 0.55, textTransform: "uppercase", marginBottom: 16 }}>by NOPA Padel</div>

                    <div style={{ fontSize: "0.7rem", letterSpacing: "0.2em", opacity: 0.7, textTransform: "uppercase", marginBottom: 4 }}>Tournament Complete</div>
                    <h1 style={{ fontSize: "1.7rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontFamily: "var(--font-display)" }}>
                        {tournament.name}
                    </h1>
                    <div style={{ fontSize: "0.8rem", opacity: 0.65, marginBottom: 6 }}>
                        {[tournament.location, getCountryDisplay(tournament.country)].filter(Boolean).join(" · ")}
                    </div>
                    <div style={{ fontSize: "0.75rem", opacity: 0.55, marginBottom: 32 }}>
                        {typeLabels[tournament.type]} · {tournament.rounds.length} rounds · {totalMatches} matches
                    </div>

                    {/* Podium top 3 */}
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 12, marginBottom: 32 }}>
                        {[1, 0, 2].map(rank => {
                            const entry = standings[rank];
                            if (!entry) return null;
                            const isFirst = rank === 0;
                            const heights = { 0: 110, 1: 80, 2: 70 };
                            const teamTone = isTeamMode ? getTeamColor(rank) : null;
                            return (
                                <div key={entry.id} style={{ textAlign: "center", flex: 1, maxWidth: 180, minWidth: 0, "--d": `${{ 2: 0.5, 1: 0.95, 0: 1.4 }[rank]}s` }}>
                                    {!isTeamMode && <Avatar name={entry.name} src={avatars[entry.id]} size={isFirst ? 54 : 42} style={{ margin: "0 auto 8px", display: "flex", boxShadow: isFirst ? "0 0 0 3px #C5A55A" : "0 0 0 2px rgba(255,255,255,0.35)" }} />}
                                    <div className="nopa-podium-badge" style={{ width: isFirst ? 42 : 34, height: isFirst ? 42 : 34, margin: "0 auto 8px", borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white" }}>
                                        {getPlacementLabel(rank)}
                                    </div>
                                    <div className={`nopa-podium-bar ${isFirst ? "first" : ""}`} style={{
                                        background: isTeamMode ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.1)",
                                        borderRadius: 0,
                                        padding: isFirst ? "20px 14px 18px" : "14px 10px 12px",
                                        border: `1px solid ${isTeamMode ? teamTone.border : "rgba(255,255,255,0.18)"}`,
                                        minHeight: heights[rank],
                                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: isFirst ? "1rem" : "0.88rem", marginBottom: 6, letterSpacing: "0.02em", maxWidth: "100%", overflowWrap: "anywhere" }}>{entry.name}</div>
                                        {isTeamMode && (
                                            <div style={{ fontSize: "0.58rem", opacity: 0.72, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                                                {entry.label}
                                            </div>
                                        )}
                                        <div style={{ fontSize: isFirst ? "2rem" : "1.5rem", fontWeight: 900, color: isTeamMode ? teamTone.accent : podiumColors[rank], lineHeight: 1 }}><CountUp value={entry.totalPoints} run={celebrate} delay={{ 2: 900, 1: 1350, 0: 1800 }[rank]} /></div>
                                        <div style={{ fontSize: "0.6rem", opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>pts</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* MVP banner */}
                    {mvp && (
                        <div className="nopa-congrats" style={{
                            background: "rgba(197,165,90,0.18)", border: "1px solid rgba(197,165,90,0.45)",
                            borderRadius: 0, padding: "16px 22px", marginBottom: 0, display: "inline-block", maxWidth: "100%",
                        }}>
                            <div style={{ fontSize: "0.65rem", letterSpacing: "0.16em", opacity: 0.85, textTransform: "uppercase", marginBottom: 4 }}>{isTeamMode ? "Congratulations, champions" : "Congratulations"}</div>
                            <div className="nopa-congrats-name" style={{ overflowWrap: "anywhere" }}>{mvp.name}</div>
                            <div style={{ fontSize: "0.78rem", opacity: 0.75, marginTop: 4 }}>{isTeamMode ? "Champion team" : "Tournament winner"} · {mvp.totalPoints} points</div>
                        </div>
                    )}
                </div>

                {/* ── Host: Release Results button ── */}
                {isHost && !released && (
                    <button className="club-btn"
                        type="button"
                        onClick={handleReleaseResults}
                        style={{
                            width: "100%", padding: "15px", borderRadius: "var(--r-card)", marginBottom: 12,
                            background: "var(--gold)", border: "none", color: "white",
                            fontWeight: 700, fontSize: "1rem", cursor: "pointer", fontFamily: "inherit",
                        }}
                    >
                        Release Results to Players
                    </button>
                )}
                {isHost && released && (
                    <div style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--green)", marginBottom: 12, fontWeight: 600 }}>
                        Results are visible to all players
                    </div>
                )}

                {/* ── Share actions ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                    <button className="club-btn"
                        type="button"
                        onClick={handleShareImage}
                        disabled={imageState === "generating"}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            background: "var(--green)", borderRadius: "var(--r-card)", padding: "15px 20px",
                            color: "white", fontWeight: 600, fontSize: "0.95rem",
                            cursor: imageState === "generating" ? "wait" : "pointer",
                            border: "none", fontFamily: "inherit", width: "100%", opacity: imageState === "generating" ? 0.7 : 1,
                        }}
                    >
                        {imageState === "generating" ? "Preparing image…" : "Share Scorecard on WhatsApp"}
                    </button>
                    {imageState === "error" && (
                        <div style={{ textAlign: "center", fontSize: "0.76rem", color: "#dc2626" }}>
                            Couldn't generate the image — try the text share below instead.
                        </div>
                    )}

                    <button className="club-btn"
                        type="button"
                        onClick={handleNativeShare}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "14px 20px",
                            color: "var(--label)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
                            border: "1.5px solid var(--sep-opaque)", fontFamily: "inherit", width: "100%",
                            boxShadow: "var(--shadow)",
                        }}
                    >
                        Share Results Link
                    </button>

                    <button
                        type="button"
                        onClick={handleCopyLink}
                        style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                            background: copied ? "rgba(28,79,53,0.06)" : "var(--bg-card)",
                            border: `1.5px solid ${copied ? "var(--green)" : "var(--sep-opaque)"}`,
                            borderRadius: "var(--r-card)", cursor: "pointer", fontFamily: "inherit", width: "100%",
                            boxShadow: "var(--shadow)",
                        }}
                    >
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: copied ? "var(--green)" : "var(--label)" }}>{copied ? "Copied!" : "Copy Results Link"}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--label-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280, marginTop: 2 }}>{pageUrl}</div>
                        </div>
                    </button>
                </div>

                {/* ── Full standings ── */}
                <div style={{ marginBottom: 32 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingLeft: 4 }}>
                        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", fontWeight: 600 }}>Full Standings</div>
                        {released && (
                            <button type="button" onClick={() => setCelebrate((n) => n + 1)} style={{ background: "none", border: "none", color: "var(--green)", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Replay</button>
                        )}
                    </div>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {standings.map((entry, i) => {
                            const losses = entry.matchesPlayed - entry.matchesWon - (entry.matchesDrawn || 0);
                            const teamTone = isTeamMode ? getTeamColor(i) : null;
                            return (
                                <div key={entry.id} className="nopa-row-in" style={{
                                    "--i": i,
                                    display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                                    borderBottom: i < standings.length - 1 ? "1px solid var(--sep)" : "none",
                                    background: isTeamMode ? teamTone.bg : i === 0 ? "rgba(197,165,90,0.05)" : undefined,
                                }}>
                                    <div style={{ width: 28, textAlign: "center", fontSize: i < 3 ? "1.1rem" : "0.88rem", fontWeight: 700, color: "var(--label-3)", flexShrink: 0 }}>
                                        {getPlacementLabel(i)}
                                    </div>
                                    {!isTeamMode && <Avatar name={entry.name} src={avatars[entry.id]} size={30} />}
                                    <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "0.9rem", color: isTeamMode ? teamTone.accent : "var(--label)" }}>
                                        {entry.name}
                                        {i === 0 && <span style={{ fontSize: "0.6rem", marginLeft: 8, background: "var(--gold)", color: "white", padding: "2px 7px", borderRadius: 50, fontWeight: 700 }}>{isTeamMode ? "Winners" : "MVP"}</span>}
                                        {isTeamMode && <div style={{ fontSize: "0.66rem", color: "var(--label-3)", marginTop: 4 }}>{entry.label}</div>}
                                        {entry.byePoints > 0 && <div style={{ fontSize: "0.66rem", color: "var(--label-3)", marginTop: 2, fontWeight: 500 }}>incl. {entry.byePoints} for {entry.roundsSatOut} round{entry.roundsSatOut === 1 ? "" : "s"} sat out</div>}
                                    </div>
                                    <div style={{ fontSize: "1rem", fontWeight: 700, color: isTeamMode ? teamTone.accent : "var(--green)", minWidth: 36, textAlign: "right" }}>{entry.totalPoints}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--label-3)", minWidth: 80, textAlign: "right" }}>
                                        {entry.matchesPlayed}P · {entry.matchesWon}W · {losses}L
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <NopaBanner />
            </div>
        </>
    );
}
