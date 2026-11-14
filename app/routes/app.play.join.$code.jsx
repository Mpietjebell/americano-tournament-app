import { json, redirect } from "@remix-run/node";
import { ClubHero } from "../components/ClubHero";
import { useLoaderData, useActionData, Form, Link } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { DEUCE_LABELS, getCountryDisplay, viewerTournament, TYPE_LABELS } from "../utils/tournament-helpers";
import { getRequestOrigin } from "../utils/request.server";
import { getRoster, registerPlayer } from "../utils/registration.server";

export const loader = async ({ params, request }) => {
    const tournament = await prisma.tournament.findUnique({
        where: { joinCode: params.code.toUpperCase() },
        include: { players: true, participants: true },
    });
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const cookie = request.headers.get("Cookie") || "";
    const cookieMatch = cookie.match(new RegExp(`nopa_player_${tournament.id}=([^;]+)`));
    const playerIdFromCookie = cookieMatch?.[1] || null;
    const origin = getRequestOrigin(request);
    const roster = getRoster(tournament);
    const standbyNotice = parseInt(new URL(request.url).searchParams.get("standby") || "", 10) || null;
    return json({
        // Only confirmed players are pickable; waitlisted people are not on the list.
        tournament: { ...viewerTournament(tournament), players: roster.activePlayers.map((p) => ({ id: p.id, name: p.name, gender: p.gender })) },
        roster: {
            activeCount: roster.activeCount,
            standbyCount: roster.standbyCount,
            maxPlayers: roster.maxPlayers,
            spotsLeft: roster.spotsLeft,
            isFull: roster.isFull,
            standbyFull: roster.standbyFull,
        },
        playerIdFromCookie,
        origin,
        standbyNotice,
    });
};

export const meta = ({ data }) => {
    if (!data?.tournament) return [{ title: "Join Tournament — NOPA" }];
    const t = data.tournament;
    const title = `Join ${t.name} — NOPA`;
    const desc = `${TYPE_LABELS[t.type] || t.type}${t.location ? ` · ${t.location}` : ""} · ${t.players.length} players joined so far. Sign up free on NOPA Padel.`;
    const image = t.logoUrl && t.logoUrl.startsWith("http") ? t.logoUrl : `${data.origin}/images/brand/clubhouse-table.jpg`;
    const url = `${data.origin}/app/play/join/${t.joinCode}`;
    return [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
    ];
};

export const action = async ({ request, params }) => {
    const formData = await request.formData();
    const playerId = formData.get("playerId");
    const customName = formData.get("customName")?.toString().trim();
    const email = formData.get("email")?.toString().trim().toLowerCase();

    const tournament = await prisma.tournament.findUnique({
        where: { joinCode: params.code.toUpperCase() },
        include: { players: { select: { id: true } }, participants: { select: { playerId: true, standbyPosition: true } } },
    });
    if (!tournament) return json({ error: "Tournament not found." }, { status: 404 });
    if (!email || !email.includes("@")) return json({ error: "Please enter a valid email address." }, { status: 400 });

    // New player path — confirmed spot while there is room, standby once full
    if (customName) {
        const result = await registerPlayer({ tournamentId: tournament.id, name: customName, email });
        if (!result.ok) return json({ error: result.error }, { status: result.status });

        if (result.standby) {
            return redirect(`/app/play/join/${tournament.joinCode}?standby=${result.position}`);
        }
        return redirect(`/app/play/tournament/${tournament.id}/player?playerId=${result.playerId}`, {
            headers: {
                "Set-Cookie": `nopa_player_${tournament.id}=${result.playerId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`,
            },
        });
    }

    // Existing player path
    if (!playerId) return json({ error: "Please select your name or add yourself below." }, { status: 400 });
    if (!getRoster(tournament).activePlayers.some((p) => p.id === playerId)) {
        return json({ error: "That player is not on this tournament's list." }, { status: 400 });
    }

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
    const { tournament, roster, playerIdFromCookie, standbyNotice } = useLoaderData();
    const started = tournament.status !== "setup";
    const canAddName = !started && !roster.standbyFull;
    const actionData = useActionData();
    const [selectedPlayer, setSelectedPlayer] = useState("");
    const [customName, setCustomName] = useState("");
    // "new" = type own name, "list" = pick from pre-registered list (default)
    const [nameMode, setNameMode] = useState(tournament.players.length > 0 ? "list" : "new");
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const hasPreregistered = tournament.players.length > 0;

    const emailValid = email.includes("@") && email.includes(".");

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

            <ClubHero
                eyebrow="You're invited"
                title={tournament.name}
                sub={`${tournament.location} · ${getCountryDisplay(tournament.country)}`}
                frame="locker"
            />

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

                {/* Where sign-ups stand */}
                {standbyNotice ? (
                    <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "var(--r-card)", padding: "16px 18px", marginBottom: 20, color: "#9a3412" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>You're on the standby list — position {standbyNotice}</div>
                        <div style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>The tournament is full. If a player drops out, the first person on standby gets the spot and an email.</div>
                    </div>
                ) : (
                    <div style={{
                        background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "14px 18px", marginBottom: 20,
                        boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    }}>
                        <div>
                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 600, marginBottom: 2 }}>Players</div>
                            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--green)" }}>
                                {roster.activeCount}{roster.maxPlayers ? ` / ${roster.maxPlayers}` : ""}
                                {roster.standbyCount > 0 && <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--label-3)" }}> · {roster.standbyCount} on standby</span>}
                            </div>
                        </div>
                        <div style={{
                            fontSize: "0.74rem", fontWeight: 700, padding: "5px 12px", borderRadius: "var(--r-pill)", whiteSpace: "nowrap",
                            background: started || roster.isFull ? "#fff7ed" : "rgba(28,79,53,0.1)",
                            color: started || roster.isFull ? "#9a3412" : "var(--green)",
                        }}>
                            {started ? "Already started" : roster.standbyFull ? "Full" : roster.isFull ? "Full · standby open" : roster.spotsLeft != null ? `${roster.spotsLeft} spot${roster.spotsLeft === 1 ? "" : "s"} left` : "Open"}
                        </div>
                    </div>
                )}

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

                    {/* Step 2: Who are you? */}
                    {step === 2 && (
                        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "24px 20px", marginBottom: 20, boxShadow: "var(--shadow)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                Step 2 of 2
                            </div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--label)", marginBottom: 6 }}>Who are you?</div>

                            {/* Mode toggle — only show if there are pre-registered players */}
                            {started && (
                                <p style={{ fontSize: "0.83rem", color: "var(--label-3)", margin: "0 0 14px", lineHeight: 1.5 }}>
                                    This tournament has started, so new sign-ups are closed. Already playing? Pick your name to follow your matches.
                                </p>
                            )}
                            {!started && !canAddName && (
                                <p style={{ fontSize: "0.83rem", color: "#9a3412", margin: "0 0 14px", lineHeight: 1.5 }}>
                                    This tournament and its standby list are full, so new sign-ups are closed. Already on the list? Pick your name below.
                                </p>
                            )}
                            {hasPreregistered && canAddName && (
                                <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--sep-opaque)", borderRadius: "var(--r-cell)", overflow: "hidden", marginBottom: 20 }}>
                                    {[
                                        { id: "new", label: "Enter my name" },
                                        { id: "list", label: "Pick from list" },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => { setNameMode(opt.id); setSelectedPlayer(""); setCustomName(""); }}
                                            style={{
                                                flex: 1, padding: "10px 0", border: "none",
                                                background: nameMode === opt.id ? "var(--green)" : "transparent",
                                                color: nameMode === opt.id ? "white" : "var(--label-3)",
                                                fontWeight: 600, fontSize: "0.84rem", cursor: "pointer",
                                                fontFamily: "inherit", transition: "all 0.15s",
                                            }}
                                        >{opt.label}</button>
                                    ))}
                                </div>
                            )}

                            {/* Enter my name (default) */}
                            {nameMode === "new" && !canAddName && (
                                <p style={{ fontSize: "0.86rem", color: "#9a3412", marginBottom: 20 }}>
                                    {started ? "New sign-ups are closed." : "This tournament and its standby list are full."}
                                </p>
                            )}
                            {nameMode === "new" && canAddName && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 8, fontWeight: 600 }}>Your full name</div>
                                    <input
                                        value={customName}
                                        onChange={e => setCustomName(e.target.value)}
                                        placeholder="e.g. Jan de Vries"
                                        autoFocus
                                        style={{
                                            width: "100%", padding: "14px", fontSize: "1rem",
                                            border: "1.5px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                            background: "var(--bg-grouped)", fontFamily: "inherit", color: "var(--label)",
                                            outline: "none", transition: "border-color 0.2s",
                                        }}
                                        onFocus={e => e.target.style.borderColor = "var(--green)"}
                                        onBlur={e => e.target.style.borderColor = "var(--sep-opaque)"}
                                    />
                                    <input type="hidden" name="customName" value={customName} />
                                </div>
                            )}

                            {/* Pick from pre-registered list */}
                            {nameMode === "list" && (
                                <div style={{ marginBottom: 20 }}>
                                    <p style={{ fontSize: "0.83rem", color: "var(--label-3)", marginBottom: 14, lineHeight: 1.5 }}>
                                        Select your name from the list below.
                                    </p>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
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
                                        {/* Empty slot — tap to enter own name */}
                                        {canAddName && <button
                                            type="button"
                                            onClick={() => { setNameMode("new"); setSelectedPlayer(""); setCustomName(""); }}
                                            style={{
                                                padding: "16px 10px", borderRadius: "var(--r-cell)", cursor: "pointer", textAlign: "center",
                                                border: "2px dashed var(--sep-opaque)",
                                                background: "transparent",
                                                fontWeight: 500, fontSize: "0.88rem",
                                                color: "var(--label-3)",
                                                fontFamily: "inherit",
                                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                                            }}
                                        >
                                            <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>+</div>
                                            <div style={{ fontSize: "0.78rem" }}>{roster.isFull ? "Join standby" : "Add your name"}</div>
                                        </button>}
                                    </div>
                                </div>
                            )}

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
                                    disabled={nameMode === "new" ? customName.trim().length < 2 : !selectedPlayer}
                                    style={{
                                        flex: 1, padding: "13px", borderRadius: "var(--r-card)",
                                        background: (nameMode === "new" ? customName.trim().length >= 2 : !!selectedPlayer) ? "var(--green)" : "var(--sep-opaque)",
                                        color: "white", fontWeight: 600, fontSize: "0.95rem",
                                        border: "none", cursor: (nameMode === "new" ? customName.trim().length >= 2 : !!selectedPlayer) ? "pointer" : "not-allowed",
                                        fontFamily: "inherit", transition: "background 0.2s",
                                    }}
                                >
                                    {(nameMode === "new" ? customName.trim().length >= 2 : !!selectedPlayer) ? (nameMode === "new" && roster.isFull ? "Join Standby List" : "Join Tournament") : nameMode === "new" ? "Enter your name above" : "Select your name above"}
                                </button>
                            </div>
                        </div>
                    )}
                </Form>

                <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--label-3)", marginTop: 16 }}>
                    Wrong event?{" "}
                    <a href="/app/play/join" style={{ color: "var(--green)" }}>Enter a different code</a>
                </p>

                {playerIdFromCookie && (
                    <div style={{ marginTop: 16 }}>
                        {showCancelConfirm ? (
                            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-card)", padding: "20px" }}>
                                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#991b1b", marginBottom: 8 }}>
                                    Are you sure you want to deregister from this tournament?
                                </div>
                                <p style={{ fontSize: "0.84rem", color: "#b91c1c", marginBottom: 16, lineHeight: 1.5 }}>
                                    This cannot be undone. If players are on standby, the first one will take your spot.
                                </p>
                                <Form method="post" action={`/api/tournament/${tournament.id}/deregister`}>
                                    <input type="hidden" name="playerId" value={playerIdFromCookie} />
                                    <div style={{ display: "flex", gap: 10 }}>
                                        <button type="button" onClick={() => setShowCancelConfirm(false)}
                                            style={{ flex: 1, padding: "12px", borderRadius: "var(--r-card)", background: "var(--bg-fill)", border: "1px solid var(--sep)", color: "var(--label-2)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                            No, keep my spot
                                        </button>
                                        <button type="submit"
                                            style={{ flex: 1, padding: "12px", borderRadius: "var(--r-card)", background: "#dc2626", border: "none", color: "white", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                            Yes, deregister
                                        </button>
                                    </div>
                                </Form>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowCancelConfirm(true)}
                                style={{ width: "100%", padding: "13px", borderRadius: "var(--r-card)", background: "transparent", border: "2px solid #dc2626", color: "#dc2626", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel Registration
                            </button>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
