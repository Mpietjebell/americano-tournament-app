import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { getUser, publicUser } from "../utils/user.server";
import { generateClubCode } from "../utils/clubs.server";

export const meta = () => [
    { title: "Clubs & leaderboards — NOPA Clubhouse" },
    { name: "description", content: "Start a padel club for your own group, run tournaments together and keep a shared leaderboard — public or private." },
];

const LOGIN_URL = "/app/play?login=1&next=/app/play/clubs";

const clubCard = (c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    isPublic: c.isPublic,
    members: c._count.members,
    tournaments: c._count.tournaments,
});

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const user = await getUser(request);
    const count = { _count: { select: { members: true, tournaments: true } } };
    const [myClubs, publicClubs] = await Promise.all([
        user
            ? prisma.club.findMany({ where: { members: { some: { userId: user.id } } }, include: count, orderBy: { createdAt: "desc" } })
            : [],
        prisma.club.findMany({ where: { isPublic: true }, include: count, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const mine = new Set(myClubs.map((c) => c.id));
    return json({
        user: publicUser(user),
        myClubs: myClubs.map(clubCard),
        publicClubs: publicClubs.filter((c) => !mine.has(c.id)).map(clubCard),
        prefillCode: (url.searchParams.get("code") || "").toUpperCase().slice(0, 6),
    });
};

export const action = async ({ request }) => {
    const user = await getUser(request);
    if (!user) return redirect(LOGIN_URL);
    const form = await request.formData();
    const intent = form.get("intent");

    if (intent === "create") {
        const name = (form.get("name") || "").toString().trim();
        const city = (form.get("city") || "").toString().trim() || null;
        const description = (form.get("description") || "").toString().trim().slice(0, 280) || null;
        const isPublic = form.get("visibility") !== "private";
        if (name.length < 3 || name.length > 60) {
            return json({ form: "create", error: "Give your club a name of 3 to 60 characters." }, { status: 400 });
        }
        const club = await prisma.club.create({
            data: {
                name, city, description, isPublic,
                joinCode: await generateClubCode(),
                ownerId: user.id,
                members: { create: { userId: user.id } },
            },
        });
        return redirect(`/app/play/clubs/${club.id}`);
    }

    if (intent === "join") {
        const code = (form.get("code") || "").toString().trim().toUpperCase();
        const club = code ? await prisma.club.findUnique({ where: { joinCode: code } }) : null;
        if (!club) return json({ form: "join", error: "No club found with that invite code." }, { status: 404 });
        await prisma.clubMember.upsert({
            where: { clubId_userId: { clubId: club.id, userId: user.id } },
            update: {},
            create: { clubId: club.id, userId: user.id },
        });
        return redirect(`/app/play/clubs/${club.id}`);
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

function ClubRow({ c }) {
    return (
        <Link to={`/app/play/clubs/${c.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--label)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--label-3)", marginTop: 2 }}>
                        {c.members} member{c.members === 1 ? "" : "s"} · {c.tournaments} tournament{c.tournaments === 1 ? "" : "s"}{c.city ? ` · ${c.city}` : ""}
                    </div>
                </div>
                {!c.isPublic && (
                    <span style={{ flexShrink: 0, background: "var(--bg-fill)", color: "var(--label-3)", borderRadius: 50, padding: "2px 8px", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase" }}>Private</span>
                )}
                <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}><path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
        </Link>
    );
}

const sectionTitle = { fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 700, margin: "22px 4px 8px" };
const errorBox = { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: "0.82rem" };

export default function ClubsIndex() {
    const { user, myClubs, publicClubs, prefillCode } = useLoaderData();
    const actionData = useActionData();
    const [creating, setCreating] = useState(actionData?.form === "create");
    const [visibility, setVisibility] = useState("public");

    return (
        <>
            <nav className="ios-nav">
                <Link to="/app/play" className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Home
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>

            <div className="ios-page" style={{ maxWidth: 560 }}>
                <div style={{ textAlign: "center", marginBottom: 18 }}>
                    <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2rem", fontWeight: 400, color: "var(--label)", marginBottom: 6 }}>Clubs</h1>
                    <p style={{ color: "var(--label-3)", fontSize: "0.86rem", lineHeight: 1.5 }}>
                        Your own group, your own tournaments, one shared leaderboard.
                    </p>
                </div>

                {!user ? (
                    <div className="nopa-card" style={{ textAlign: "center" }}>
                        <p style={{ fontSize: "0.88rem", color: "var(--label-2)", marginBottom: 14, lineHeight: 1.5 }}>
                            Sign in to start a club or join one with an invite code.
                        </p>
                        <Link to={`${LOGIN_URL}${prefillCode ? encodeURIComponent(`?code=${prefillCode}`) : ""}`} style={{ textDecoration: "none" }}>
                            <button className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Sign in</button>
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="nopa-card" style={{ marginBottom: 12 }}>
                            <Form method="post">
                                <input type="hidden" name="intent" value="join" />
                                <label className="nopa-label" htmlFor="club-code">Have an invite code?</label>
                                {actionData?.form === "join" && <div style={errorBox}>{actionData.error}</div>}
                                <div style={{ display: "flex", gap: 8 }}>
                                    <input id="club-code" className="nopa-input" name="code" defaultValue={prefillCode} placeholder="ABC123" maxLength={6} autoCapitalize="characters" autoComplete="off" style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }} required />
                                    <button type="submit" className="nopa-btn nopa-btn-secondary" style={{ flexShrink: 0 }}>Join club</button>
                                </div>
                            </Form>
                        </div>

                        {!creating ? (
                            <button type="button" className="nopa-btn nopa-btn-primary" style={{ width: "100%" }} onClick={() => setCreating(true)}>
                                Start a club
                            </button>
                        ) : (
                            <div className="nopa-card">
                                <Form method="post">
                                    <input type="hidden" name="intent" value="create" />
                                    {actionData?.form === "create" && <div style={errorBox}>{actionData.error}</div>}
                                    <div style={{ marginBottom: 12 }}>
                                        <label className="nopa-label" htmlFor="club-name">Club name</label>
                                        <input id="club-name" className="nopa-input" name="name" placeholder="e.g. Friday Padel Crew" maxLength={60} required />
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label className="nopa-label" htmlFor="club-city">City <span style={{ textTransform: "none", fontWeight: 400 }}>— optional</span></label>
                                        <input id="club-city" className="nopa-input" name="city" placeholder="e.g. Amsterdam" maxLength={60} />
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label className="nopa-label" htmlFor="club-desc">About <span style={{ textTransform: "none", fontWeight: 400 }}>— optional</span></label>
                                        <input id="club-desc" className="nopa-input" name="description" placeholder="Who is it for?" maxLength={280} />
                                    </div>
                                    <div style={{ marginBottom: 14 }}>
                                        <span className="nopa-label">Who can see the leaderboard?</span>
                                        {[
                                            { val: "public", label: "Public", desc: "Anyone can find the club and see its leaderboard" },
                                            { val: "private", label: "Private", desc: "Only members — people join with your invite code" },
                                        ].map((opt) => (
                                            <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", cursor: "pointer" }}>
                                                <input type="radio" name="visibility" value={opt.val} checked={visibility === opt.val} onChange={() => setVisibility(opt.val)} style={{ accentColor: "var(--green)", width: 16, height: 16, flexShrink: 0 }} />
                                                <span>
                                                    <span style={{ display: "block", fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>{opt.label}</span>
                                                    <span style={{ display: "block", fontSize: "0.74rem", color: "var(--label-3)" }}>{opt.desc}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%" }}>Create club</button>
                                </Form>
                            </div>
                        )}

                        <div style={sectionTitle}>My clubs</div>
                        <div className="nopa-feed">
                            {myClubs.length === 0
                                ? <div className="nopa-feed-empty">You are not in a club yet.</div>
                                : myClubs.map((c) => <ClubRow key={c.id} c={c} />)}
                        </div>
                    </>
                )}

                <div style={sectionTitle}>Public clubs</div>
                <div className="nopa-feed">
                    {publicClubs.length === 0
                        ? <div className="nopa-feed-empty">No public clubs yet — start the first one.</div>
                        : publicClubs.map((c) => <ClubRow key={c.id} c={c} />)}
                </div>
            </div>
        </>
    );
}
