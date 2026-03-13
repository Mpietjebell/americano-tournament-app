import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { DEUCE_LABELS, getCountryDisplay, TYPE_LABELS } from "../utils/tournament-helpers";

export const loader = async ({ params }) => {
    const tournament = await prisma.tournament.findUnique({
        where: { joinCode: params.code.toUpperCase() },
        include: { players: true },
    });
    if (!tournament) throw new Response("Not Found", { status: 404 });
    return json({ tournament });
};

export const action = async ({ request, params }) => {
    const formData = await request.formData();
    const playerId = formData.get("playerId");
    const email = formData.get("email")?.toString().trim().toLowerCase();

    const tournament = await prisma.tournament.findUnique({
        where: { joinCode: params.code.toUpperCase() },
    });
    if (!tournament) return json({ error: "Tournament not found." }, { status: 404 });
    if (!playerId) return json({ error: "Please select your name from the list." }, { status: 400 });
    if (!email || !email.includes("@")) return json({ error: "Please enter a valid email address." }, { status: 400 });

    // Save participant email — non-critical, don't block on failure
    try {
        const existing = await prisma.tournamentParticipant.findFirst({
            where: { tournamentId: tournament.id, playerId },
        });
        if (existing) {
            await prisma.tournamentParticipant.update({
                where: { id: existing.id },
                data: { email },
            });
        } else {
            await prisma.tournamentParticipant.create({
                data: { email, tournamentId: tournament.id, playerId },
            });
        }
    } catch {
        // Participant tracking unavailable — continue to join anyway
    }

    return redirect(`/app/play/tournament/${tournament.id}/player?playerId=${playerId}`, {
        headers: {
            "Set-Cookie": `nopa_player_${tournament.id}=${playerId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
        },
    });
};

export default function JoinCode() {
    const { tournament } = useLoaderData();
    const actionData = useActionData();
    const [selectedPlayer, setSelectedPlayer] = useState("");
    const [step, setStep] = useState(1); // 1 = email, 2 = pick name
    const [email, setEmail] = useState("");

    const emailValid = email.includes("@") && email.includes(".");

    return (
        <>
            <nav className="ios-nav">
                <a href="/app/play/join" className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Home
                </a>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>

            {/* Hero strip */}
            <div style={{
                height: 200,
                backgroundImage: "url(/player-portal.png)",
                backgroundSize: "cover",
                backgroundPosition: "center 25%",
                position: "relative",
            }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,79,53,0.25) 0%, rgba(0,0,0,0.65) 100%)" }} />
                <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", padding: "0 20px" }}>
                    <div style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontStyle: "italic",
                        fontSize: "1.5rem",
                        fontWeight: 400,
                        color: "white",
                        letterSpacing: "0.02em",
                        textShadow: "0 2px 16px rgba(0,0,0,0.4)",
                        lineHeight: 1.2,
                    }}>
                        {tournament.name}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
                        {tournament.location} · {getCountryDisplay(tournament.country)}
                    </div>
                </div>
            </div>

            <div className="ios-page" style={{ maxWidth: 560 }}>

                {/* Tournament info pills */}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
                    {[
                        TYPE_LABELS[tournament.type] || tournament.type,
                        `${tournament.courtsAvailable} courts`,
                        `${tournament.pointsPerMatch} pts`,
                        DEUCE_LABELS[tournament.deuceMethod] || tournament.deuceMethod,
                    ].map(label => (
                        <span key={label} style={{
                            background: "var(--bg-card)", border: "1px solid var(--sep-opaque)",
                            borderRadius: "var(--r-pill)", padding: "5px 13px",
                            fontSize: "0.78rem", fontWeight: 500, color: "var(--label-2)",
                            boxShadow: "var(--shadow)", textTransform: "capitalize",
                        }}>{label}</span>
                    ))}
                </div>

                {/* Step indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
                    {[{ n: 1, label: "Your Email" }, { n: 2, label: "Your Name" }].map(({ n, label }, i, arr) => (
                        <div key={n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{
                                    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "0.72rem", fontWeight: 700, flexShrink: 0,
                                    background: step >= n ? "var(--green)" : "var(--sep-opaque)",
                                    color: step >= n ? "white" : "var(--label-3)",
                                    transition: "all 0.2s",
                                }}>
                                    {step > n ? (
                                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                                            <path d="M1 5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    ) : n}
                                </div>
                                <span style={{ fontSize: "0.8rem", fontWeight: step === n ? 600 : 400, color: step === n ? "var(--label)" : "var(--label-3)", whiteSpace: "nowrap" }}>
                                    {label}
                                </span>
                            </div>
                            {i < arr.length - 1 && (
                                <div style={{ flex: 1, height: 1.5, background: step > 1 ? "var(--green)" : "var(--sep-opaque)", margin: "0 12px", transition: "background 0.3s" }} />
                            )}
                        </div>
                    ))}
                </div>

                {actionData?.error && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-cell)", padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                        {actionData.error}
                    </div>
                )}

                <Form method="post">
                    <input type="hidden" name="playerId" value={selectedPlayer} />

                    {/* Step 1: Email */}
                    {step === 1 && (
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "24px 20px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                Step 1 of 2
                            </div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--label)", marginBottom: 6 }}>What's your email?</div>
                            <p style={{ fontSize: "0.83rem", color: "var(--label-3)", marginBottom: 20, lineHeight: 1.5 }}>
                                No account needed — used to send you the final results.
                            </p>
                            <input
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoFocus
                                style={{
                                    width: "100%", padding: "13px 14px", fontSize: "1rem",
                                    border: "1.5px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                    background: "var(--bg-grouped)", fontFamily: "inherit", color: "var(--label)",
                                    outline: "none", marginBottom: 16, transition: "border-color 0.2s",
                                }}
                                onFocus={e => e.target.style.borderColor = "var(--green)"}
                                onBlur={e => e.target.style.borderColor = "var(--sep-opaque)"}
                            />
                            <button
                                type="button"
                                disabled={!emailValid}
                                onClick={() => setStep(2)}
                                style={{
                                    width: "100%", padding: "14px", borderRadius: "var(--r-card)",
                                    background: emailValid ? "var(--green)" : "var(--sep-opaque)",
                                    color: "white", fontWeight: 600, fontSize: "0.95rem",
                                    border: "none", cursor: emailValid ? "pointer" : "not-allowed",
                                    fontFamily: "inherit", transition: "background 0.2s",
                                }}
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {/* Step 2: Pick name */}
                    {step === 2 && (
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "24px 20px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                Step 2 of 2
                            </div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--label)", marginBottom: 6 }}>Who are you?</div>
                            <p style={{ fontSize: "0.83rem", color: "var(--label-3)", marginBottom: 20, lineHeight: 1.5 }}>
                                Select your name from the list below.
                            </p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 24 }}>
                                {tournament.players.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setSelectedPlayer(p.id)}
                                        style={{
                                            padding: "16px 10px", borderRadius: "var(--r-cell)", cursor: "pointer", textAlign: "center",
                                            border: `2px solid ${selectedPlayer === p.id ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: selectedPlayer === p.id ? "rgba(28,79,53,0.08)" : "var(--bg-grouped)",
                                            fontWeight: selectedPlayer === p.id ? 700 : 500, fontSize: "0.88rem",
                                            color: selectedPlayer === p.id ? "var(--green)" : "var(--label-2)",
                                            transition: "all 0.15s", fontFamily: "inherit",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                            {p.gender === "male" ? "Male" : p.gender === "female" ? "Female" : "Player"}
                                        </div>
                                        {p.name}
                                    </button>
                                ))}
                            </div>

                            <input type="hidden" name="email" value={email} />

                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    style={{
                                        padding: "13px 20px", borderRadius: "var(--r-card)",
                                        background: "var(--bg-fill)", color: "var(--label-2)",
                                        fontWeight: 500, fontSize: "0.9rem", border: "none",
                                        cursor: "pointer", fontFamily: "inherit",
                                    }}
                                >
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={!selectedPlayer}
                                    style={{
                                        flex: 1, padding: "13px", borderRadius: "var(--r-card)",
                                        background: selectedPlayer ? "var(--green)" : "var(--sep-opaque)",
                                        color: "white", fontWeight: 600, fontSize: "0.95rem",
                                        border: "none", cursor: selectedPlayer ? "pointer" : "not-allowed",
                                        fontFamily: "inherit", transition: "background 0.2s",
                                    }}
                                >
                                    {selectedPlayer ? "Join Tournament" : "Select your name above"}
                                </button>
                            </div>
                        </div>
                    )}
                </Form>

                <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--label-3)", marginTop: 16 }}>
                    Wrong event?{" "}
                    <a href="/app/play/join" style={{ color: "var(--green)" }}>Enter a different code</a>
                </p>
            </div>
        </>
    );
}
