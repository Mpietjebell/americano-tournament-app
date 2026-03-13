import { json, redirect } from "@remix-run/node";
import { useActionData, Form, Link } from "@remix-run/react";
import prisma from "../db.server";

export const action = async ({ request }) => {
    const formData = await request.formData();
    const code = formData.get("code")?.toString().trim().toUpperCase();
    if (!code) return json({ error: "Please enter a join code." }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({ where: { joinCode: code } });
    if (!tournament) return json({ error: "No tournament found with that code. Check for typos." }, { status: 404 });

    return redirect(`/app/play/join/${code}`);
};

export default function JoinPage() {
    const actionData = useActionData();

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

            {/* Hero strip */}
            <div style={{
                height: 220,
                backgroundImage: "url(/player-portal.png)",
                backgroundSize: "cover",
                backgroundPosition: "center 20%",
                position: "relative",
            }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,79,53,0.3) 0%, rgba(0,0,0,0.55) 100%)" }} />
                <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, textAlign: "center" }}>
                    <div style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontStyle: "italic",
                        fontSize: "2.6rem",
                        fontWeight: 400,
                        color: "white",
                        letterSpacing: "0.04em",
                        textShadow: "0 2px 20px rgba(0,0,0,0.3)",
                        lineHeight: 1,
                    }}>
                        Join a Tournament
                    </div>
                </div>
            </div>

            {/* Form */}
            <div style={{ maxWidth: 440, margin: "0 auto", padding: "32px 20px 60px" }}>
                <div className="nopa-card">
                    <div style={{ marginBottom: 20, textAlign: "center" }}>
                        <p style={{ color: "var(--label-3)", fontSize: "0.88rem", margin: 0 }}>
                            Enter the code shared by your host
                        </p>
                    </div>

                    <Form method="post">
                        {actionData?.error && (
                            <div style={{
                                background: "#fef2f2", border: "1px solid #fca5a5",
                                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
                                color: "#991b1b", fontSize: "0.85rem",
                            }}>
                                {actionData.error}
                            </div>
                        )}
                        <div className="nopa-form-group">
                            <label className="nopa-label">Join Code</label>
                            <input
                                className="nopa-input"
                                name="code"
                                placeholder="ABC123"
                                maxLength={6}
                                autoFocus
                                autoComplete="off"
                                style={{
                                    textTransform: "uppercase",
                                    fontSize: "1.8rem",
                                    fontWeight: 700,
                                    textAlign: "center",
                                    letterSpacing: "0.35em",
                                    fontFamily: "monospace",
                                    paddingTop: 16,
                                    paddingBottom: 16,
                                }}
                            />
                        </div>
                        <button type="submit" style={{ width: "100%", justifyContent: "center", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.92rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(28,79,53,0.24)" }}>
                            Find Tournament
                        </button>
                    </Form>
                </div>
            </div>
        </>
    );
}
