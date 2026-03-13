import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, Link, useActionData } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { TYPE_LABELS } from "../utils/tournament-helpers";

function getUserIdFromCookie(request) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/nopa_user=([^;]+)/);
    return match ? match[1] : null;
}

export const loader = async ({ request }) => {
    const userId = getUserIdFromCookie(request);
    let user = null;
    if (userId) {
        user = await prisma.tournamentUser.findUnique({ where: { id: userId } });
    }
    const myTournaments = userId
        ? await prisma.tournament.findMany({
            where: { createdById: userId },
            include: { players: true },
            orderBy: { createdAt: "desc" },
            take: 10,
        })
        : [];
    const communityTournaments = await prisma.tournament.findMany({
        where: { isPublic: true, status: "finished" },
        include: { players: true },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    const activeTournaments = await prisma.tournament.findMany({
        where: { isPublic: true, status: { in: ["setup", "active"] } },
        include: { players: true },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
    return json({ user, myTournaments, communityTournaments, activeTournaments });
};

export const action = async ({ request }) => {
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "login") {
        const email = formData.get("email")?.toString().trim().toLowerCase();
        const username = formData.get("username")?.toString().trim();
        if (!email) return json({ error: "Please enter your email." }, { status: 400 });
        let user = await prisma.tournamentUser.findUnique({ where: { email } });
        if (!user) {
            if (!username) return json({ error: "First time? Please also enter a username.", needsUsername: true, email }, { status: 400 });
            user = await prisma.tournamentUser.create({ data: { email, username } });
        }
        return redirect("/app/play", {
            headers: { "Set-Cookie": `nopa_user=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}` },
        });
    }
    if (intent === "logout") {
        return redirect("/app/play", {
            headers: { "Set-Cookie": "nopa_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" },
        });
    }
    return json({ error: "Unknown action" }, { status: 400 });
};

function TournamentFeedCard({ t }) {
    const winner = t.status === "finished"
        ? [...t.players].sort((a, b) => b.totalPoints - a.totalPoints)[0]
        : null;
    const isLive = t.status === "active" || t.status === "setup";
    return (
        <Link
            to={t.status === "finished" ? `/app/play/tournament/${t.id}/final` : `/app/play/tournament/${t.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
        >
            <div style={{
                padding: "13px 16px",
                borderBottom: "1px solid var(--sep)",
                transition: "background 0.15s",
                cursor: "pointer",
            }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(28,79,53,0.035)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", fontWeight: 700, flexShrink: 0, marginTop: 4 }}>
                        {t.country || "INT"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--label)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.name}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--label-3)" }}>
                            {TYPE_LABELS[t.type] || t.type} · {t.players.length} players
                            {t.location && ` · ${t.location}`}
                        </div>
                        {winner && (
                            <div style={{ fontSize: "0.7rem", color: "var(--gold)", fontWeight: 600, marginTop: 3 }}>
                                Winner: {winner.name} · {winner.totalPoints} pts
                            </div>
                        )}
                    </div>
                    {isLive && (
                        <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                            background: "rgba(28,79,53,0.1)", color: "var(--green)",
                            borderRadius: 50, padding: "2px 8px", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
                        }}>
                            <span className="nopa-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                            Live
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}

export default function PlayHome() {
    const { user, myTournaments, communityTournaments, activeTournaments } = useLoaderData();
    const actionData = useActionData();
    const [showLogin, setShowLogin] = useState(false);
    const [email, setEmail] = useState(actionData?.email || "");
    const [activeTab, setActiveTab] = useState("community");

    const feedList = activeTab === "community" ? communityTournaments
        : activeTab === "mine" ? myTournaments
        : activeTournaments;

    const tabs = [
        { id: "community", label: "Community", count: communityTournaments.length },
        { id: "live", label: "Live", count: activeTournaments.length },
        ...(myTournaments.length > 0 ? [{ id: "mine", label: "Mine", count: myTournaments.length }] : []),
    ];

    return (
        <>
            <style>{`
                @keyframes nopa-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
                .nopa-pulse { animation: nopa-pulse 1.6s ease-in-out infinite; }
                .login-overlay {
                    position: fixed; inset: 0;
                    background: rgba(0,0,0,0.45);
                    display: flex; align-items: center; justify-content: center;
                    z-index: 100; backdrop-filter: blur(6px);
                }
            `}</style>

            {/* ── Topbar ── */}
            <div style={{
                background: "var(--green)", color: "white",
                padding: "0 24px", height: 52,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                position: "sticky", top: 0, zIndex: 50,
            }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.2em", fontSize: "1.05rem", fontWeight: 500 }}>
                    NOPA
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {user ? (
                        <>
                            <span style={{ fontSize: "0.78rem", opacity: 0.75, fontWeight: 500 }}>{user.username}</span>
                            <Form method="post" style={{ display: "inline" }}>
                                <input type="hidden" name="intent" value="logout" />
                                <button type="submit" className="nopa-topbar-btn">Sign out</button>
                            </Form>
                        </>
                    ) : (
                        <button onClick={() => setShowLogin(true)} className="nopa-topbar-btn">Sign in</button>
                    )}
                </div>
            </div>

            {/* ── Main layout ── */}
            <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden", background: "var(--bg)" }}>

                {/* ── Left panel ── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                    {/* Hero image */}
                    <div style={{
                        flex: 1,
                        backgroundImage: "url(/hero-court.png)",
                        backgroundSize: "cover",
                        backgroundPosition: "center 40%",
                        position: "relative",
                        minHeight: 0,
                    }}>
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.06) 40%, rgba(0,0,0,0.52) 100%)" }} />

                        <div style={{ position: "absolute", bottom: 36, left: 0, right: 0, textAlign: "center", padding: "0 24px" }}>
                            <div style={{
                                fontFamily: "'Cormorant Garamond', serif",
                                fontStyle: "italic",
                                fontWeight: 300,
                                fontSize: "clamp(3rem, 8vw, 7rem)",
                                lineHeight: 0.88,
                                color: "white",
                                textShadow: "0 2px 24px rgba(0,0,0,0.35)",
                                userSelect: "none",
                            }}>
                                Clubhouse
                            </div>
                            <div style={{
                                fontFamily: "'Cormorant Garamond', serif",
                                fontStyle: "italic",
                                fontWeight: 600,
                                fontSize: "clamp(2.6rem, 7vw, 6rem)",
                                lineHeight: 1,
                                color: "white",
                                marginTop: "0.06em",
                                textShadow: "0 2px 24px rgba(0,0,0,0.35)",
                                userSelect: "none",
                            }}>
                                Americano
                            </div>
                        </div>
                    </div>

                    {/* CTA row */}
                    <div style={{
                        background: "var(--bg)",
                        padding: "18px 24px",
                        display: "flex",
                        gap: 10,
                        justifyContent: "center",
                        alignItems: "center",
                        flexWrap: "wrap",
                        borderTop: "1px solid var(--sep)",
                    }}>
                        <Link to="/app/play/tournament/new" style={{ textDecoration: "none" }}>
                            <button className="nopa-btn nopa-btn-primary" style={{ minWidth: 150, fontSize: "0.88rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/>
                                </svg>
                                Host
                            </button>
                        </Link>

                        <Link to="/app/play/join" style={{ textDecoration: "none" }}>
                            <button className="nopa-btn nopa-btn-secondary" style={{ minWidth: 150, fontSize: "0.88rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="8" cy="6" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/>
                                </svg>
                                Join
                            </button>
                        </Link>

                        <Link to="/app/play/join" style={{ textDecoration: "none" }}>
                            <button className="nopa-btn nopa-btn-ghost nopa-btn-small" style={{ letterSpacing: "0.04em" }}>
                                Enter Code
                            </button>
                        </Link>
                    </div>
                </div>

                {/* ── Right: Feed panel ── */}
                <div style={{
                    width: 290,
                    borderLeft: "1px solid var(--sep)",
                    background: "white",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    flexShrink: 0,
                }}>
                    {/* Segmented tabs */}
                    <div style={{ padding: "10px 12px 0", borderBottom: "1px solid var(--sep)", background: "white", flexShrink: 0 }}>
                        <div className="nopa-segmented" style={{ width: "100%", display: "flex" }}>
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`nopa-seg-btn ${activeTab === tab.id ? "active" : ""}`}
                                    style={{ flex: 1, fontSize: "0.72rem", padding: "7px 10px" }}
                                >
                                    {tab.label}
                                    {tab.count > 0 && <span style={{ opacity: 0.55, marginLeft: 4 }}>({tab.count})</span>}
                                </button>
                            ))}
                        </div>
                        <div style={{ height: 10 }} />
                    </div>

                    {/* Feed list */}
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {feedList.length === 0 ? (
                            <div style={{ padding: "52px 20px", textAlign: "center", color: "var(--label-3)" }}>
                                <div style={{ fontSize: "1.8rem", marginBottom: 10, opacity: 0.2 }}>
                                    {activeTab === "live" ? "LIVE" : "OPEN"}
                                </div>
                                <div style={{ fontSize: "0.8rem" }}>
                                    {activeTab === "live" ? "No live tournaments right now" : "No tournaments yet"}
                                </div>
                            </div>
                        ) : (
                            feedList.map(t => <TournamentFeedCard key={t.id} t={t} />)
                        )}
                    </div>
                </div>
            </div>

            {/* ── Login modal ── */}
            {showLogin && !user && (
                <div className="login-overlay" onClick={() => setShowLogin(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: "white", borderRadius: 20, padding: "32px 28px",
                        width: "100%", maxWidth: 370,
                        boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <h3 style={{
                                margin: 0, fontFamily: "'Cormorant Garamond', serif",
                                fontSize: "1.4rem", fontWeight: 500, letterSpacing: "0.04em",
                                color: "var(--green)",
                            }}>
                                Sign in to NOPA
                            </h3>
                            <button onClick={() => setShowLogin(false)} style={{
                                background: "var(--bg-fill)", border: "none",
                                width: 28, height: 28, borderRadius: "50%",
                                cursor: "pointer", color: "var(--label-3)",
                                fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center",
                            }}>×</button>
                        </div>
                        <Form method="post">
                            <input type="hidden" name="intent" value="login" />
                            {actionData?.error && (
                                <div style={{
                                    background: "#fef2f2", border: "1px solid #fca5a5",
                                    borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                                    color: "#991b1b", fontSize: "0.82rem",
                                }}>
                                    {actionData.error}
                                </div>
                            )}
                            <div style={{ marginBottom: 14 }}>
                                <label className="nopa-label">Email</label>
                                <input className="nopa-input" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                            </div>
                            {actionData?.needsUsername && (
                                <div style={{ marginBottom: 14 }}>
                                    <label className="nopa-label">Choose a username</label>
                                    <input className="nopa-input" name="username" placeholder="Your display name" required />
                                </div>
                            )}
                            <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%", marginTop: 4 }}>
                                Continue →
                            </button>
                        </Form>
                        <p style={{ marginTop: 16, fontSize: "0.72rem", color: "var(--label-3)", textAlign: "center" }}>
                            No password needed. Enter your email to get started.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
