import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { getUser } from "../utils/user.server";
import { buildClubLeaderboard } from "../utils/clubs.server";
import { getRoster } from "../utils/registration.server";
import { getRequestOrigin } from "../utils/request.server";
import { TYPE_LABELS } from "../utils/tournament-helpers";
import { NopaBanner } from "../components/NopaBanner";

export const meta = ({ data }) => [
    { title: data?.club ? `${data.club.name} — NOPA Clubhouse` : "Club — NOPA Clubhouse" },
];

async function loadClub(id) {
    return prisma.club.findUnique({
        where: { id },
        include: {
            members: { include: { user: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
            tournaments: {
                include: {
                    players: { select: { id: true, name: true } },
                    participants: { select: { playerId: true, standbyPosition: true } },
                    rounds: { include: { matches: true } },
                },
                orderBy: { createdAt: "desc" },
            },
        },
    });
}

export const loader = async ({ params, request }) => {
    const club = await loadClub(params.id);
    if (!club) throw new Response("Not Found", { status: 404 });
    const user = await getUser(request);
    const isMember = Boolean(user && club.members.some((m) => m.userId === user.id));
    const isOwner = Boolean(user && club.ownerId === user.id);
    const base = { signedIn: Boolean(user), isMember, isOwner };

    // A private club shows nothing but its name until you are a member.
    if (!club.isPublic && !isMember) {
        return json({ ...base, locked: true, club: { id: club.id, name: club.name, isPublic: false } });
    }

    const { standings, counted, awaitingRelease } = buildClubLeaderboard(club.tournaments);
    return json({
        ...base,
        locked: false,
        club: {
            id: club.id,
            name: club.name,
            description: club.description,
            city: club.city,
            isPublic: club.isPublic,
            // The invite code lets people into a private club — members only.
            joinCode: isMember ? club.joinCode : null,
        },
        members: club.members.map((m) => ({ name: m.user.username, owner: m.userId === club.ownerId })),
        standings,
        counted,
        awaitingRelease,
        tournaments: club.tournaments.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            status: t.status,
            scheduledAt: t.scheduledAt,
            maxPlayers: t.maxPlayers,
            playerCount: getRoster(t).activeCount,
        })),
        origin: getRequestOrigin(request),
    });
};

export const action = async ({ params, request }) => {
    const user = await getUser(request);
    if (!user) return redirect(`/app/play?login=1&next=/app/play/clubs/${params.id}`);
    const club = await prisma.club.findUnique({ where: { id: params.id } });
    if (!club) throw new Response("Not Found", { status: 404 });
    const form = await request.formData();
    const intent = form.get("intent");
    const where = { clubId_userId: { clubId: club.id, userId: user.id } };

    if (intent === "join") {
        if (!club.isPublic) {
            const code = (form.get("code") || "").toString().trim().toUpperCase();
            if (code !== club.joinCode) return json({ error: "That invite code is not right." }, { status: 403 });
        }
        await prisma.clubMember.upsert({ where, update: {}, create: { clubId: club.id, userId: user.id } });
        return redirect(`/app/play/clubs/${club.id}`);
    }

    if (intent === "leave") {
        if (club.ownerId === user.id) return json({ error: "The owner cannot leave the club." }, { status: 400 });
        await prisma.clubMember.deleteMany({ where: { clubId: club.id, userId: user.id } });
        return redirect("/app/play/clubs");
    }

    if (intent === "visibility") {
        if (club.ownerId !== user.id) return json({ error: "Only the club owner can change this." }, { status: 403 });
        await prisma.club.update({ where: { id: club.id }, data: { isPublic: form.get("visibility") !== "private" } });
        return redirect(`/app/play/clubs/${club.id}`);
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

const sectionTitle = { fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 700, margin: "22px 4px 8px" };
const errorBox = { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: "0.82rem" };
const STATUS_LABEL = { setup: "Open", active: "Live", finished: "Finished" };

function Nav() {
    return (
        <nav className="ios-nav">
            <Link to="/app/play/clubs" className="ios-nav-back">
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Clubs
            </Link>
            <span className="ios-nav-brand">NOPA</span>
            <span style={{ minWidth: 60 }} />
        </nav>
    );
}

export default function ClubPage() {
    const data = useLoaderData();
    const actionData = useActionData();
    const [copied, setCopied] = useState(false);
    const { club, signedIn, isMember, isOwner } = data;
    const loginUrl = `/app/play?login=1&next=/app/play/clubs/${club.id}`;

    if (data.locked) {
        return (
            <>
                <Nav />
                <div className="ios-page" style={{ maxWidth: 460 }}>
                    <div className="nopa-card" style={{ textAlign: "center" }}>
                        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.7rem", fontWeight: 400, marginBottom: 6 }}>{club.name}</h1>
                        <p style={{ color: "var(--label-3)", fontSize: "0.86rem", marginBottom: 16, lineHeight: 1.5 }}>
                            This is a private club. Its tournaments and leaderboard are only visible to members.
                        </p>
                        {signedIn ? (
                            <Form method="post">
                                <input type="hidden" name="intent" value="join" />
                                {actionData?.error && <div style={errorBox}>{actionData.error}</div>}
                                <input className="nopa-input" name="code" placeholder="Invite code" maxLength={6} autoCapitalize="characters" autoComplete="off" style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, textAlign: "center", marginBottom: 10 }} required />
                                <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Join club</button>
                            </Form>
                        ) : (
                            <Link to={loginUrl} style={{ textDecoration: "none" }}>
                                <button className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Sign in to join</button>
                            </Link>
                        )}
                    </div>
                </div>
            </>
        );
    }

    const { standings, counted, awaitingRelease, tournaments, members, origin } = data;
    const inviteUrl = club.joinCode ? `${origin}/app/play/clubs?code=${club.joinCode}` : null;
    const inviteText = inviteUrl
        ? encodeURIComponent(`Join our padel club "${club.name}" on the NOPA Clubhouse.\nInvite code: ${club.joinCode}\n${inviteUrl}`)
        : "";
    const copyInvite = () => {
        navigator.clipboard?.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <Nav />
            <div className="ios-page" style={{ maxWidth: 560 }}>
                <div style={{ textAlign: "center", marginBottom: 18 }}>
                    <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--label-3)", fontWeight: 700, marginBottom: 6 }}>
                        {club.isPublic ? "Public club" : "Private club"}{club.city ? ` · ${club.city}` : ""}
                    </div>
                    <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2rem", fontWeight: 400, color: "var(--label)", marginBottom: 6, overflowWrap: "anywhere" }}>{club.name}</h1>
                    {club.description && <p style={{ color: "var(--label-3)", fontSize: "0.86rem", lineHeight: 1.5 }}>{club.description}</p>}
                </div>

                {actionData?.error && <div style={errorBox}>{actionData.error}</div>}

                {isMember ? (
                    <Link to={`/app/play/tournament/new?club=${club.id}`} style={{ textDecoration: "none" }}>
                        <button className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Host a club tournament</button>
                    </Link>
                ) : signedIn ? (
                    <Form method="post">
                        <input type="hidden" name="intent" value="join" />
                        <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Join this club</button>
                    </Form>
                ) : (
                    <Link to={loginUrl} style={{ textDecoration: "none" }}>
                        <button className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Sign in to join</button>
                    </Link>
                )}

                <div style={sectionTitle}>Leaderboard</div>
                <div className="nopa-feed">
                    {standings.length === 0 ? (
                        <div className="nopa-feed-empty">
                            The leaderboard fills up when the club&apos;s first tournament is finished and the host has released the results.
                        </div>
                    ) : (
                        <table className="nopa-club-table">
                            <thead>
                                <tr><th>#</th><th style={{ textAlign: "left" }}>Player</th><th>Pts</th><th>W</th><th>Played</th><th>Events</th></tr>
                            </thead>
                            <tbody>
                                {standings.map((row, i) => (
                                    <tr key={row.name}>
                                        <td className="rank">{i + 1}</td>
                                        <td className="name">{row.name}{row.titles > 0 && <span className="titles" title="Tournament wins"> ★{row.titles > 1 ? row.titles : ""}</span>}</td>
                                        <td className="pts">{row.points}</td>
                                        <td>{row.won}</td>
                                        <td>{row.played}</td>
                                        <td>{row.tournaments}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--label-3)", margin: "8px 4px 0", lineHeight: 1.5 }}>
                    Points from {counted} finished tournament{counted === 1 ? "" : "s"}, added up per player name.
                    {awaitingRelease > 0 && ` ${awaitingRelease} more waiting for the host to release results.`}
                </p>

                <div style={sectionTitle}>Tournaments</div>
                <div className="nopa-feed">
                    {tournaments.length === 0 ? (
                        <div className="nopa-feed-empty">No tournaments yet.</div>
                    ) : tournaments.map((t) => (
                        <Link key={t.id} to={t.status === "finished" ? `/app/play/tournament/${t.id}/final` : `/app/play/tournament/${t.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                            <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--label-3)", marginTop: 2 }}>
                                        {TYPE_LABELS[t.type] || t.type} · {t.playerCount}{t.maxPlayers ? `/${t.maxPlayers}` : ""} players
                                    </div>
                                </div>
                                <span style={{ flexShrink: 0, background: t.status === "active" ? "rgba(28,79,53,0.1)" : "var(--bg-fill)", color: t.status === "active" ? "var(--green)" : "var(--label-3)", borderRadius: 50, padding: "2px 8px", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase" }}>
                                    {STATUS_LABEL[t.status] || t.status}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>

                {inviteUrl && (
                    <>
                        <div style={sectionTitle}>Invite players</div>
                        <div className="nopa-card" style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "0.28em", color: "var(--green)", fontFamily: "monospace", marginBottom: 12 }}>{club.joinCode}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <a href={`https://wa.me/?text=${inviteText}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", background: "#25D366", color: "white", borderRadius: "var(--r-pill)", padding: "11px 10px", fontWeight: 600, fontSize: "0.84rem" }}>WhatsApp</a>
                                <button type="button" onClick={copyInvite} className="nopa-btn nopa-btn-ghost" style={{ padding: "11px 10px", fontSize: "0.84rem" }}>{copied ? "Copied" : "Copy link"}</button>
                            </div>
                        </div>
                    </>
                )}

                <div style={sectionTitle}>Members · {members.length}</div>
                <div className="nopa-card" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {members.map((m, i) => (
                        <span key={i} style={{ background: "var(--bg-fill)", borderRadius: 50, padding: "5px 12px", fontSize: "0.8rem", color: "var(--label-2)" }}>
                            {m.name}{m.owner ? " · owner" : ""}
                        </span>
                    ))}
                </div>

                {isOwner && (
                    <Form method="post" style={{ marginTop: 14 }}>
                        <input type="hidden" name="intent" value="visibility" />
                        <input type="hidden" name="visibility" value={club.isPublic ? "private" : "public"} />
                        <button type="submit" className="nopa-btn nopa-btn-ghost" style={{ width: "100%" }}>
                            {club.isPublic ? "Make this club private" : "Make this club public"}
                        </button>
                    </Form>
                )}
                {isMember && !isOwner && (
                    <Form method="post" style={{ marginTop: 14 }}>
                        <input type="hidden" name="intent" value="leave" />
                        <button type="submit" className="nopa-btn nopa-btn-ghost" style={{ width: "100%" }}>Leave club</button>
                    </Form>
                )}

                <NopaBanner />
            </div>
        </>
    );
}
