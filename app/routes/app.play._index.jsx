import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, Link, useActionData } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { TYPE_LABELS, describeLevel } from "../utils/tournament-helpers";
import { getRoster } from "../utils/registration.server";
import { getUser, publicUser, userCookie, clearUserCookie } from "../utils/user.server";
import { NopaBanner } from "../components/NopaBanner";
import { InstallHint } from "../components/InstallHint";
import { ResumeCard } from "../components/Resume";
import { Avatar } from "../components/Avatar";
import { ExplainerTiles } from "../components/ExplainerVideo";
import { ClubHero } from "../components/ClubHero";

export const meta = () => [
    { title: "NOPA Clubhouse — Host & join padel Americano tournaments" },
    { name: "description", content: "Free padel Americano & Mexicano tournaments. Host your own, share a link, score live from your phone, and run a leaderboard for your club." },
];

const FEED_INCLUDE = {
    players: { select: { id: true, name: true, totalPoints: true } },
    participants: { select: { playerId: true, standbyPosition: true } },
    club: { select: { name: true } },
};

/** Only what a feed row shows — never host tokens, passwords or emails. */
function feedItem(t) {
    const roster = getRoster(t);
    const winner = t.status === "finished" && t.resultsPublished
        ? [...roster.activePlayers].sort((a, b) => b.totalPoints - a.totalPoints)[0]
        : null;
    return {
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        country: t.country,
        location: t.location,
        scheduledAt: t.scheduledAt,
        isPublic: t.isPublic,
        maxPlayers: t.maxPlayers,
        playerCount: roster.activeCount,
        levelRange: describeLevel(t.level, t.levelMax)?.range || null,
        clubName: t.club?.name || null,
        winner: winner ? { name: winner.name, points: winner.totalPoints } : null,
    };
}

function safeNext(value) {
    const next = (value || "").toString();
    return next.startsWith("/app/play") ? next : "/app/play";
}

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const user = await getUser(request);
    const [mine, results, live, upcoming] = await Promise.all([
        user
            ? prisma.tournament.findMany({ where: { createdById: user.id }, include: FEED_INCLUDE, orderBy: { createdAt: "desc" }, take: 20 })
            : [],
        prisma.tournament.findMany({ where: { isPublic: true, status: "finished", resultsPublished: true }, include: FEED_INCLUDE, orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.tournament.findMany({ where: { isPublic: true, status: "active" }, include: FEED_INCLUDE, orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.tournament.findMany({ where: { isPublic: true, status: "setup", scheduledAt: { gt: new Date() } }, include: FEED_INCLUDE, orderBy: { scheduledAt: "asc" }, take: 20 }),
    ]);
    return json({
        user: publicUser(user),
        mine: mine.map(feedItem),
        results: results.map(feedItem),
        live: live.map(feedItem),
        upcoming: upcoming.map(feedItem),
        wantsLogin: url.searchParams.get("login") === "1" && !user,
        next: safeNext(url.searchParams.get("next")),
    });
};

export const action = async ({ request }) => {
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === "login") {
        const email = formData.get("email")?.toString().trim().toLowerCase();
        const username = formData.get("username")?.toString().trim();
        const next = safeNext(formData.get("next"));
        if (!email || !email.includes("@")) return json({ error: "Please enter a valid email." }, { status: 400 });
        let user = await prisma.tournamentUser.findUnique({ where: { email } });
        if (!user) {
            if (!username) return json({ error: "First time here? Pick a display name too.", needsUsername: true, email }, { status: 400 });
            user = await prisma.tournamentUser.create({ data: { email, username } });
        }
        return redirect(next, { headers: { "Set-Cookie": userCookie(user.id) } });
    }
    if (intent === "logout") {
        return redirect("/app/play", { headers: { "Set-Cookie": clearUserCookie } });
    }
    return json({ error: "Unknown action" }, { status: 400 });
};

function FeedCard({ t, mine }) {
    const isUpcoming = t.status === "setup" && t.scheduledAt && new Date(t.scheduledAt) > new Date();
    const isLive = t.status === "active";
    const to = t.status === "finished"
        ? `/app/play/tournament/${t.id}/final`
        : mine ? `/app/play/tournament/${t.id}/overview` : `/app/play/tournament/${t.id}`;
    return (
        <Link to={to} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", fontWeight: 700, flexShrink: 0, marginTop: 4, minWidth: 22 }}>
                        {t.country || "INT"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--label)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--label-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {TYPE_LABELS[t.type] || t.type} · {t.playerCount}{t.maxPlayers ? `/${t.maxPlayers}` : ""} players{t.levelRange ? ` · Level ${t.levelRange}` : ""}
                            {t.location ? ` · ${t.location}` : ""}
                        </div>
                        {t.clubName && (
                            <div style={{ fontSize: "0.72rem", color: "var(--label-2)", marginTop: 3 }}>Club: {t.clubName}</div>
                        )}
                        {isUpcoming && (
                            <div style={{ fontSize: "0.74rem", color: "var(--green)", fontWeight: 600, marginTop: 3 }} suppressHydrationWarning>
                                {new Date(t.scheduledAt).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                        )}
                        {t.winner && (
                            <div style={{ fontSize: "0.74rem", color: "var(--gold)", fontWeight: 600, marginTop: 3 }}>
                                Winner: {t.winner.name} · {t.winner.points} pts
                            </div>
                        )}
                    </div>
                    {isLive && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, background: "rgba(28,79,53,0.1)", color: "var(--green)", borderRadius: 50, padding: "2px 8px", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase" }}>
                            <span className="nopa-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                            Live
                        </span>
                    )}
                    {mine && !t.isPublic && (
                        <span style={{ flexShrink: 0, background: "var(--bg-fill)", color: "var(--label-3)", borderRadius: 50, padding: "2px 8px", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase" }}>Private</span>
                    )}
                </div>
            </div>
        </Link>
    );
}

const EMPTY_COPY = {
    upcoming: "No open tournaments yet — host the first one.",
    live: "No tournaments are being played right now.",
    results: "No published results yet.",
    mine: "Tournaments you host while signed in show up here.",
};

export default function PlayHome() {
    const { user, mine, results, live, upcoming, wantsLogin, next } = useLoaderData();
    const actionData = useActionData();
    const [showLogin, setShowLogin] = useState(wantsLogin || Boolean(actionData?.error));
    const [email, setEmail] = useState(actionData?.email || "");
    const [activeTab, setActiveTab] = useState(live.length > 0 && upcoming.length === 0 ? "live" : "upcoming");

    const lists = { upcoming, live, results, mine };
    const tabs = [
        { id: "upcoming", label: "Open", count: upcoming.length },
        { id: "live", label: "Live", count: live.length },
        { id: "results", label: "Results", count: results.length },
        ...(user ? [{ id: "mine", label: "Mine", count: mine.length }] : []),
    ];
    const feedList = lists[activeTab] || [];
    const loginOpen = (showLogin || Boolean(actionData?.error)) && !user;

    return (
        <>
            <style>{`
                @keyframes nopa-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
                .nopa-pulse { animation: nopa-pulse 1.6s ease-in-out infinite; }
                .login-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; backdrop-filter: blur(6px); padding: 16px; }
            `}</style>

            <div className="nopa-home-bar">
                <span className="nopa-home-brand">NOPA</span>
                <div className="nopa-home-user">
                    {user ? (
                        <Link to="/app/play/profile" className="nopa-home-profile" aria-label="My profile">
                            <span>{user.username}</span>
                            <Avatar name={user.username} src={user.avatar} size={32} />
                        </Link>
                    ) : (
                        <button type="button" onClick={() => setShowLogin(true)} className="nopa-topbar-btn">Sign in</button>
                    )}
                </div>
            </div>

            <ClubHero photo="table" eyebrow="The Clubhouse" title="Americano" sub="Host a tournament, join one, follow the scores." as="h1" />

            <main className="nopa-home-main">
                <ResumeCard />
                <InstallHint />

                <div className="nopa-home-cta">
                    <Link to="/app/play/tournament/new">
                        <button className="nopa-btn nopa-btn-primary">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/></svg>
                            Host
                        </button>
                    </Link>
                    <Link to="/app/play/join">
                        <button className="nopa-btn nopa-btn-secondary">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="6" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg>
                            Join
                        </button>
                    </Link>
                </div>
                <div className="nopa-home-secondary">
                    <Link to="/app/play/clubs">Clubs &amp; leaderboards</Link>
                    <Link to="/app/play/scoring">How scoring works</Link>
                </div>

                <ExplainerTiles />

                <div className="nopa-segmented" role="tablist">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`nopa-seg-btn ${activeTab === tab.id ? "active" : ""}`}
                        >
                            {tab.label}
                            {tab.count > 0 && <span style={{ opacity: 0.55, marginLeft: 4 }}>{tab.count}</span>}
                        </button>
                    ))}
                </div>

                <div className="nopa-feed">
                    {feedList.length === 0
                        ? <div className="nopa-feed-empty">{EMPTY_COPY[activeTab]}</div>
                        : feedList.map((t) => <FeedCard key={t.id} t={t} mine={activeTab === "mine"} />)}
                </div>

                <NopaBanner />

                <p style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--label-3)", lineHeight: 1.5 }}>
                    A free community tool for padel players.<br />Host your own tournaments — no account needed.
                </p>
            </main>

            {loginOpen && (
                <div className="login-overlay" onClick={() => setShowLogin(false)}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 370, boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 500, letterSpacing: "0.04em", color: "var(--green)" }}>
                                Sign in to the Clubhouse
                            </h3>
                            <button type="button" aria-label="Close" onClick={() => setShowLogin(false)} style={{ background: "var(--bg-fill)", border: "none", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", color: "var(--label-3)", fontSize: "1rem" }}>×</button>
                        </div>
                        <Form method="post">
                            <input type="hidden" name="intent" value="login" />
                            <input type="hidden" name="next" value={next} />
                            {actionData?.error && (
                                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: "0.82rem" }}>
                                    {actionData.error}
                                </div>
                            )}
                            <div style={{ marginBottom: 14 }}>
                                <label className="nopa-label" htmlFor="login-email">Email</label>
                                <input id="login-email" className="nopa-input" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                            </div>
                            {actionData?.needsUsername && (
                                <div style={{ marginBottom: 14 }}>
                                    <label className="nopa-label" htmlFor="login-username">Display name</label>
                                    <input id="login-username" className="nopa-input" name="username" placeholder="How other players see you" required />
                                </div>
                            )}
                            <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%", marginTop: 4 }}>Continue</button>
                        </Form>
                        <p style={{ marginTop: 16, fontSize: "0.72rem", color: "var(--label-3)", textAlign: "center", lineHeight: 1.5 }}>
                            No password. Signing in lets you keep your tournaments in one place and run a club.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
