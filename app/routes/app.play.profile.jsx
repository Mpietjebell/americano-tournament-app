import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import prisma from "../db.server";
import { getUser, publicUser, clearUserCookie } from "../utils/user.server";
import { parseAvatarUpload } from "../utils/avatar.server";
import { AvatarPicker } from "../components/Avatar";

export const meta = () => [{ title: "My profile — NOPA Clubhouse" }];

const LOGIN_URL = "/app/play?login=1&next=/app/play/profile";

export const loader = async ({ request }) => {
    const user = await getUser(request);
    if (!user) return redirect(LOGIN_URL);
    const [hosted, clubs] = await Promise.all([
        prisma.tournament.count({ where: { createdById: user.id } }),
        prisma.clubMember.count({ where: { userId: user.id } }),
    ]);
    return json({ user: publicUser(user), hosted, clubs });
};

export const action = async ({ request }) => {
    const user = await getUser(request);
    if (!user) return redirect(LOGIN_URL);
    const form = await request.formData();
    const intent = form.get("intent");

    if (intent === "logout") {
        return redirect("/app/play", { headers: { "Set-Cookie": clearUserCookie } });
    }

    if (intent === "remove_avatar") {
        await prisma.tournamentUser.update({ where: { id: user.id }, data: { avatar: null, avatarKey: null } });
        return json({ saved: "Photo removed." });
    }

    if (intent === "save") {
        const username = (form.get("username") || "").toString().trim();
        const city = (form.get("city") || "").toString().trim().slice(0, 60) || null;
        if (username.length < 2 || username.length > 30) {
            return json({ error: "Your display name needs 2 to 30 characters." }, { status: 400 });
        }
        const upload = parseAvatarUpload(form.get("avatar"));
        if (upload.error) return json({ error: upload.error }, { status: 400 });
        await prisma.tournamentUser.update({
            where: { id: user.id },
            data: { username, city, ...(upload.skip ? {} : { avatar: upload.avatar, avatarKey: upload.avatarKey }) },
        });
        return json({ saved: "Profile saved." });
    }

    return json({ error: "Unknown action" }, { status: 400 });
};

export default function Profile() {
    const { user, hosted, clubs } = useLoaderData();
    const actionData = useActionData();
    const saving = useNavigation().state !== "idle";

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

            <div className="ios-page" style={{ maxWidth: 480 }}>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 400, textAlign: "center", marginBottom: 18 }}>My profile</h1>

                {actionData?.error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: "0.82rem" }}>{actionData.error}</div>}
                {actionData?.saved && <div style={{ background: "rgba(28,79,53,0.08)", border: "1px solid rgba(28,79,53,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "var(--green)", fontSize: "0.82rem", fontWeight: 600 }}>{actionData.saved}</div>}

                <div className="nopa-card">
                    {/* key: after a save the picker starts fresh with the stored photo */}
                    <Form method="post" key={user.avatar || "none"}>
                        <input type="hidden" name="intent" value="save" />
                        <div style={{ marginBottom: 18 }}>
                            <AvatarPicker name={user.username} src={user.avatar} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label className="nopa-label" htmlFor="profile-name">Display name</label>
                            <input id="profile-name" className="nopa-input" name="username" defaultValue={user.username} maxLength={30} required />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label className="nopa-label" htmlFor="profile-city">Home city <span style={{ textTransform: "none", fontWeight: 400 }}>— optional</span></label>
                            <input id="profile-city" className="nopa-input" name="city" defaultValue={user.city || ""} maxLength={60} placeholder="e.g. Amsterdam" />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <span className="nopa-label">Email</span>
                            <div style={{ fontSize: "0.9rem", color: "var(--label-2)", overflowWrap: "anywhere" }}>{user.email}</div>
                            <div style={{ fontSize: "0.7rem", color: "var(--label-3)", marginTop: 4, lineHeight: 1.5 }}>
                                Join tournaments with this email and your photo shows next to your name in the standings.
                            </div>
                        </div>
                        <button type="submit" className="nopa-btn nopa-btn-primary" style={{ width: "100%" }} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
                    </Form>
                    {user.avatar && (
                        <Form method="post" style={{ marginTop: 10, textAlign: "center" }}>
                            <input type="hidden" name="intent" value="remove_avatar" />
                            <button type="submit" style={{ background: "none", border: "none", color: "var(--label-3)", fontSize: "0.78rem", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Remove photo</button>
                        </Form>
                    )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
                    <Link to="/app/play" className="nopa-card" style={{ textDecoration: "none", textAlign: "center", padding: 16 }}>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--green)" }}>{hosted}</div>
                        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 700 }}>Hosted</div>
                    </Link>
                    <Link to="/app/play/clubs" className="nopa-card" style={{ textDecoration: "none", textAlign: "center", padding: 16 }}>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--green)" }}>{clubs}</div>
                        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 700 }}>Clubs</div>
                    </Link>
                </div>

                <Form method="post">
                    <input type="hidden" name="intent" value="logout" />
                    <button type="submit" className="nopa-btn nopa-btn-ghost" style={{ width: "100%" }}>Sign out</button>
                </Form>
            </div>
        </>
    );
}
