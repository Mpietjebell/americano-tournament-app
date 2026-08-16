import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { getRequestOrigin } from "../utils/request.server";

const SHOPIFY_JOIN_BASE = "https://nopabrand.com/pages/organise-americano";
const LABELS = { americano: "Americano", mexicano: "Mexicano", team_americano: "Team Americano", team_mexicano: "Team Mexicano", king_of_the_court: "King of the Court", beat_the_box: "Beat the Box" };
const LEVEL_TOOLTIP = ["", "Playtomic 0–1 · Beginner", "Playtomic 0–1.5 · Recreational", "Playtomic 2–3 · Intermediate", "Playtomic 3–4 · Advanced", "Playtomic 4+ · Competitive"];

export const loader = async ({ params, request }) => {
    const code = params.code.toUpperCase();
    const tournament = await prisma.tournament.findUnique({
        where: { joinCode: code },
        include: {
            players: { select: { name: true } },
            participants: { select: { name: true, standbyPosition: true }, orderBy: { createdAt: "asc" } },
            venue: true,
        },
    });

    if (!tournament || !tournament.isPublic) {
        throw new Response("Not Found", { status: 404 });
    }

    const activeParticipants = tournament.participants.filter(p => p.standbyPosition == null);
    const standbyParticipants = tournament.participants.filter(p => p.standbyPosition != null);
    const playerCount = tournament.players.length + activeParticipants.length;
    const standbyCount = standbyParticipants.length;

    const allNames = [
        ...tournament.players.map(p => p.name),
        ...activeParticipants.map(p => p.name),
    ].filter(n => n && !n.includes("@"));

    const isPast = tournament.status === "finished" ||
        (tournament.scheduledAt && new Date(tournament.scheduledAt) < new Date());

    return json({
        id: tournament.id,
        name: tournament.name,
        joinCode: tournament.joinCode,
        logoUrl: tournament.logoUrl || null,
        organizerName: tournament.organizerName || null,
        type: tournament.type,
        scheduledAt: tournament.scheduledAt,
        duration: tournament.duration || null,
        price: tournament.price ?? null,
        currency: tournament.currency || "EUR",
        googleMapsUrl: tournament.googleMapsUrl || null,
        city: tournament.city || tournament.venue?.city || null,
        country: tournament.country || tournament.venue?.country || null,
        venueName: tournament.venue?.name || (tournament.location && !tournament.location.startsWith("http") ? tournament.location : null),
        maxPlayers: tournament.maxPlayers || null,
        maxStandby: tournament.maxStandby || null,
        playerCount,
        standbyCount,
        playerNames: allNames,
        level: tournament.level || null,
        description: tournament.description || null,
        isPast,
        status: tournament.status,
        origin: getRequestOrigin(request),
    });
};

export const meta = ({ data }) => {
    if (!data?.name) return [{ title: "Join an Americano — NOPA" }];
    const title = `${data.name} — NOPA`;
    const bits = [
        LABELS[data.type] || data.type,
        data.venueName || data.city,
        `${data.playerCount}${data.maxPlayers ? `/${data.maxPlayers}` : ""} players`,
    ].filter(Boolean);
    const desc = data.description?.trim() || `${bits.join(" · ")} — join this Americano on NOPA Padel.`;
    const image = data.logoUrl && data.logoUrl.startsWith("http") ? data.logoUrl : `${data.origin}/hero-court.png`;
    const url = `${data.origin}/j/${data.joinCode}`;
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

function flag(code) {
    if (!code || code === "OTHER") return "🌍";
    try { return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0))); }
    catch { return "🌍"; }
}

function fmtDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ShareLanding() {
    const t = useLoaderData();

    const spotsLeft = t.maxPlayers ? Math.max(0, t.maxPlayers - t.playerCount) : null;
    const isFull = t.maxPlayers && t.playerCount >= t.maxPlayers;
    const hasWaitlist = t.standbyCount > 0;
    const joinUrl = `${SHOPIFY_JOIN_BASE}?join=${t.joinCode}`;

    const btnText = t.isPast ? "Tournament Finished" : isFull && !t.maxStandby ? "Tournament Full" : isFull ? "Join Waitlist" : "🎾 Join Tournament";
    const btnDisabled = t.isPast || (isFull && !t.maxStandby);
    const btnBg = isFull && !btnDisabled ? "#ea580c" : "#1C4F35";

    const rows = [];
    for (let i = 0; i < t.playerNames.length; i++) {
        rows.push({ name: t.playerNames[i], open: false });
    }
    if (t.maxPlayers) {
        const openSlots = Math.max(0, t.maxPlayers - t.playerCount);
        for (let i = 0; i < openSlots; i++) {
            rows.push({ name: null, open: true });
        }
    }

    return (
        <div style={{ minHeight: "100vh", background: "#f5f4f1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", paddingBottom: 100 }}>

            {/* Minimal header */}
            <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
                <a href="https://nopabrand.com" style={{ textDecoration: "none" }}>
                    <img src="https://nopabrand.com/cdn/shop/files/NOPA_Logo_clear_background.png" alt="NOPA" style={{ height: 32, objectFit: "contain" }} />
                </a>
            </div>

            <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 16px 0" }}>

                {/* ── Bento card ── */}
                <div style={{ borderRadius: 20, background: "#1C4F35", overflow: "hidden", boxShadow: "0 8px 32px rgba(28,79,53,0.28)", marginBottom: 16 }}>

                    {/* Card header */}
                    <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {t.logoUrl && (
                                <img src={t.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover", border: "1.5px solid rgba(255,255,255,.25)", flexShrink: 0 }} />
                            )}
                            <div>
                                <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "rgba(255,255,255,.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    {flag(t.country)} {t.city || "International"}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {t.level && (
                                <div title={LEVEL_TOOLTIP[t.level] || ""} style={{ display: "flex", gap: 3 }}>
                                    {[1,2,3,4,5].map(d => (
                                        <div key={d} style={{ width: 8, height: 8, borderRadius: "50%", background: d <= t.level ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.2)", border: d <= t.level ? "none" : "1px solid rgba(255,255,255,.3)" }} />
                                    ))}
                                </div>
                            )}
                            <span style={{ fontSize: "0.52rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", padding: "3px 9px", borderRadius: 99, background: isFull ? (hasWaitlist ? "#ea580c" : "#dc2626") : "rgba(255,255,255,.15)", color: "white", border: isFull ? "none" : "1px solid rgba(255,255,255,.25)" }}>
                                {t.isPast ? "Finished" : isFull ? (hasWaitlist ? "Waitlist" : "Full") : "Open"}
                            </span>
                        </div>
                    </div>

                    {/* Name */}
                    <div style={{ padding: "0 16px 4px" }}>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "white", lineHeight: 1.2 }}>{t.name}</div>
                        {t.organizerName && <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,.45)", marginTop: 2, fontWeight: 500 }}>by {t.organizerName}</div>}
                        {t.venueName && t.googleMapsUrl && (
                            <a href={t.googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "rgba(255,255,255,.8)", textDecoration: "none", fontWeight: 600, marginTop: 4 }}>
                                📍 {t.venueName}
                            </a>
                        )}
                        {t.type && (
                            <span style={{ display: "inline-block", marginTop: 6, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,.75)", background: "rgba(255,255,255,.13)", borderRadius: 6, padding: "3px 8px" }}>
                                {LABELS[t.type] || t.type}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    {t.description && (
                        <div style={{ padding: "8px 16px 4px", fontSize: "0.72rem", color: "rgba(255,255,255,.7)", fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,.08)", lineHeight: 1.5 }}>
                            {t.description}
                        </div>
                    )}

                    {/* Stats 2×2 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "10px 14px 14px" }}>
                        {[
                            { label: "Date", val: t.scheduledAt ? fmtDate(t.scheduledAt) : "TBC" },
                            { label: "Time", val: t.scheduledAt ? fmtTime(t.scheduledAt) : "—", green: true },
                            { label: "Duration", val: t.duration ? `${t.duration} min` : "—" },
                            { label: "Entry", val: t.price ? `${t.price} ${t.currency}` : "Free", green: true },
                        ].map(s => (
                            <div key={s.label} style={{ background: "rgba(255,255,255,.11)", borderRadius: 10, padding: "8px 10px" }}>
                                <div style={{ fontSize: "0.46rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,.5)", marginBottom: 3 }}>{s.label}</div>
                                <div style={{ fontSize: "0.9rem", fontWeight: 800, color: s.green ? "rgba(255,255,255,.95)" : "white", lineHeight: 1 }}>{s.val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Spots bar */}
                    {t.maxPlayers && (
                        <div style={{ padding: "0 14px 14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", color: "rgba(255,255,255,.5)", marginBottom: 5, fontWeight: 500 }}>
                                <span>{spotsLeft > 0 ? `${spotsLeft} spots left` : "Full"}</span>
                                {hasWaitlist && <span>{t.standbyCount} on waitlist</span>}
                            </div>
                            <div style={{ height: 5, background: "rgba(255,255,255,.15)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                                <div style={{ height: "100%", background: "rgba(255,255,255,.85)", width: `${Math.round(Math.min(t.playerCount, t.maxPlayers) / (t.maxPlayers + (t.maxStandby || 0)) * 100)}%`, transition: "width .4s ease", flexShrink: 0 }} />
                                {t.standbyCount > 0 && t.maxStandby > 0 && (
                                    <div style={{ height: "100%", background: "#ef4444", width: `${Math.round(Math.min(t.standbyCount, t.maxStandby) / (t.maxPlayers + t.maxStandby) * 100)}%`, flexShrink: 0 }} />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Player list ── */}
                <div style={{ background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.07)", marginBottom: 16 }}>
                    <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#bbb" }}>
                            Players {t.maxPlayers ? `(${t.playerCount} / ${t.maxPlayers})` : `(${t.playerCount})`}
                        </div>
                    </div>
                    {rows.map((row, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,.04)" : "none", background: row.open ? "rgba(28,79,53,.02)" : "white" }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#ccc", minWidth: 18 }}>{i + 1}</span>
                            {row.open ? (
                                <span style={{ fontSize: "0.85rem", color: "#ccc", fontStyle: "italic" }}>— open slot —</span>
                            ) : (
                                <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#222" }}>{row.name}</span>
                            )}
                        </div>
                    ))}
                    {t.standbyCount > 0 && (
                        <div style={{ padding: "10px 16px", background: "#fff7ed", borderTop: "1px solid #fed7aa" }}>
                            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#9a3412" }}>⏳ {t.standbyCount} on waitlist</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Sticky join button ── */}
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "rgba(245,244,241,.92)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(0,0,0,.08)", zIndex: 100 }}>
                {btnDisabled ? (
                    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "15px", borderRadius: 14, background: "#e5e5e5", color: "#aaa", fontWeight: 700, fontSize: "1rem", textAlign: "center", fontFamily: "inherit" }}>
                        {btnText}
                    </div>
                ) : (
                    <a href={joinUrl} style={{ display: "block", maxWidth: 480, margin: "0 auto", padding: "15px", borderRadius: 14, background: btnBg, color: "white", fontWeight: 700, fontSize: "1rem", textAlign: "center", textDecoration: "none", letterSpacing: "0.02em" }}>
                        {btnText}
                    </a>
                )}
            </div>
        </div>
    );
}
