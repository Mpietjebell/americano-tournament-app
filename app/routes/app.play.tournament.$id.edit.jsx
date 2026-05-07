import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form, Link } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { validateHostToken } from "../utils/host-auth.server";
import { sendLocationChanged, sendPriceChanged } from "../utils/email.server";
import { TYPE_LABELS, DEUCE_LABELS } from "../utils/tournament-helpers";

const COUNTRIES = [
    { code: "AF", name: "Afghanistan" }, { code: "AL", name: "Albania" }, { code: "DZ", name: "Algeria" },
    { code: "AR", name: "Argentina" }, { code: "AU", name: "Australia" }, { code: "AT", name: "Austria" },
    { code: "BH", name: "Bahrain" }, { code: "BE", name: "Belgium" }, { code: "BR", name: "Brazil" },
    { code: "CA", name: "Canada" }, { code: "CL", name: "Chile" }, { code: "CN", name: "China" },
    { code: "CO", name: "Colombia" }, { code: "HR", name: "Croatia" }, { code: "CZ", name: "Czech Republic" },
    { code: "DK", name: "Denmark" }, { code: "EG", name: "Egypt" }, { code: "FI", name: "Finland" },
    { code: "FR", name: "France" }, { code: "DE", name: "Germany" }, { code: "GR", name: "Greece" },
    { code: "HK", name: "Hong Kong" }, { code: "HU", name: "Hungary" }, { code: "IN", name: "India" },
    { code: "ID", name: "Indonesia" }, { code: "IR", name: "Iran" }, { code: "IQ", name: "Iraq" },
    { code: "IE", name: "Ireland" }, { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
    { code: "JP", name: "Japan" }, { code: "JO", name: "Jordan" }, { code: "KW", name: "Kuwait" },
    { code: "LB", name: "Lebanon" }, { code: "MY", name: "Malaysia" }, { code: "MX", name: "Mexico" },
    { code: "MA", name: "Morocco" }, { code: "NL", name: "Netherlands" }, { code: "NZ", name: "New Zealand" },
    { code: "NG", name: "Nigeria" }, { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" },
    { code: "PK", name: "Pakistan" }, { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" },
    { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" }, { code: "QA", name: "Qatar" },
    { code: "RO", name: "Romania" }, { code: "RU", name: "Russia" }, { code: "SA", name: "Saudi Arabia" },
    { code: "SG", name: "Singapore" }, { code: "ZA", name: "South Africa" }, { code: "ES", name: "Spain" },
    { code: "SE", name: "Sweden" }, { code: "CH", name: "Switzerland" }, { code: "TW", name: "Taiwan" },
    { code: "TH", name: "Thailand" }, { code: "TN", name: "Tunisia" }, { code: "TR", name: "Turkey" },
    { code: "UA", name: "Ukraine" }, { code: "AE", name: "United Arab Emirates" },
    { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
    { code: "VN", name: "Vietnam" }, { code: "OTHER", name: "Other" },
];

export const loader = async ({ params, request }) => {
    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { players: true, participants: { where: { standbyPosition: null } }, venue: true },
    });
    if (!tournament) throw new Response("Not Found", { status: 404 });

    const hostToken = await validateHostToken(request, tournament);
    if (!hostToken) throw new Response("Forbidden", { status: 403 });

    if (tournament.status !== "setup") {
        return redirect(`/app/play/tournament/${params.id}/overview`);
    }

    return json({ tournament });
};

export const action = async ({ params, request }) => {
    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { participants: { where: { standbyPosition: null } }, venue: true },
    });
    if (!tournament) return json({ error: "Not found" }, { status: 404 });

    const hostToken = await validateHostToken(request, tournament);
    if (!hostToken) return json({ error: "Forbidden" }, { status: 403 });
    if (tournament.status !== "setup") return json({ error: "Cannot edit after rounds are generated" }, { status: 409 });

    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "remove_player") {
        const playerId = formData.get("playerId");
        await prisma.player.delete({ where: { id: playerId } });
        return json({ ok: true });
    }

    if (intent === "add_player") {
        const name = (formData.get("newPlayerName") || "").toString().trim();
        if (!name) return json({ error: "Player name required" });
        await prisma.player.create({
            data: { name, gender: "unspecified", tournamentId: params.id },
        });
        return json({ ok: true });
    }

    // Full settings save
    const name = (formData.get("name") || "").toString().trim() || tournament.name;
    const type = formData.get("type") || tournament.type;
    const courts = parseInt(formData.get("courts"), 10) || tournament.courtsAvailable;
    const pointsPerMatch = parseInt(formData.get("pointsPerMatch"), 10) || tournament.pointsPerMatch;
    const deuceMethod = formData.get("deuceMethod") || tournament.deuceMethod;
    const maxPlayers = formData.get("maxPlayers") ? parseInt(formData.get("maxPlayers"), 10) || null : tournament.maxPlayers;
    const price = formData.get("price") ? parseFloat(formData.get("price")) : null;
    const currency = formData.get("currency") || tournament.currency || "EUR";
    const city = formData.get("city") || null;
    const country = formData.get("country") || tournament.country;
    const googleMapsUrl = formData.get("googleMapsUrl") || null;
    const location = (formData.get("location") || "").toString().trim() || tournament.location;
    const isPublic = formData.get("isPublic") !== "false";
    const scheduledAtStr = formData.get("scheduledAt") || null;
    const duration = formData.get("duration") ? parseInt(formData.get("duration"), 10) : null;

    const locationChanged =
        (googleMapsUrl || null) !== (tournament.googleMapsUrl || null) ||
        (city || null) !== (tournament.city || null) ||
        location !== tournament.location;
    const priceChanged =
        price !== tournament.price ||
        currency !== (tournament.currency || "EUR");

    await prisma.tournament.update({
        where: { id: params.id },
        data: {
            name, type,
            courtsAvailable: courts,
            pointsPerMatch, deuceMethod,
            maxPlayers: maxPlayers || null,
            price: price ?? null,
            currency,
            city,
            country,
            googleMapsUrl,
            location,
            isPublic,
            scheduledAt: scheduledAtStr ? new Date(scheduledAtStr) : tournament.scheduledAt,
            duration,
        },
    });

    const updatedTournament = await prisma.tournament.findUnique({ where: { id: params.id }, include: { venue: true } });
    const activeParticipants = tournament.participants.filter(p => p.email);

    if (locationChanged && activeParticipants.length > 0) {
        sendLocationChanged({ participants: activeParticipants, tournament: updatedTournament }).catch(() => {});
    }
    if (priceChanged && activeParticipants.length > 0) {
        sendPriceChanged({ participants: activeParticipants, tournament: updatedTournament }).catch(() => {});
    }

    return redirect(`/app/play/tournament/${params.id}/overview`);
};

const PLAY_TYPES = ["americano", "mexicano", "team_americano", "team_mexicano", "king_of_the_court", "beat_the_box"];
const DEUCE_METHODS = ["deuce", "golden_point", "starpoint", "tie_break"];

function SectionLabel({ children }) {
    return (
        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 10, marginTop: 24, fontWeight: 600 }}>
            {children}
        </div>
    );
}

export default function EditTournament() {
    const { tournament } = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";
    const [newPlayerName, setNewPlayerName] = useState("");

    return (
        <>
            <nav className="ios-nav">
                <Link to={`/app/play/tournament/${tournament.id}/overview`} className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Overview
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>

            {/* Host indicator strip */}
            <div style={{ background: "#1C4F35", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: "0.58rem", fontWeight: 800, color: "white", textTransform: "uppercase", letterSpacing: "0.12em" }}>Host</span>
                <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>Edit Mode — changes saved on submit</span>
            </div>

            <div className="ios-page">
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.8rem", fontWeight: 400, color: "var(--label)", marginBottom: 4 }}>
                    Edit Tournament
                </h1>
                <p style={{ fontSize: "0.82rem", color: "var(--label-3)", marginBottom: 8 }}>{tournament.name}</p>

                {actionData?.error && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-cell)", padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: "0.88rem" }}>
                        {actionData.error}
                    </div>
                )}

                {/* ── Players (separate forms per action) ── */}
                <SectionLabel>Players</SectionLabel>
                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                    {tournament.players.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--sep)", gap: 12 }}>
                            <span style={{ flex: 1, fontSize: "0.92rem", color: "var(--label)", fontWeight: 500 }}>{p.name}</span>
                            <Form method="post">
                                <input type="hidden" name="intent" value="remove_player" />
                                <input type="hidden" name="playerId" value={p.id} />
                                <button type="submit" style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>
                                    Remove
                                </button>
                            </Form>
                        </div>
                    ))}
                    <Form method="post" style={{ padding: "12px 16px", display: "flex", gap: 8 }} onSubmit={() => setNewPlayerName("")}>
                        <input type="hidden" name="intent" value="add_player" />
                        <input
                            name="newPlayerName"
                            placeholder="Add player name..."
                            value={newPlayerName}
                            onChange={e => setNewPlayerName(e.target.value)}
                            style={{ flex: 1, padding: "9px 12px", border: "1.5px solid var(--sep-opaque)", borderRadius: "var(--r-cell)", fontSize: "0.9rem", fontFamily: "inherit", color: "var(--label)", background: "var(--bg-grouped)", outline: "none" }}
                        />
                        <button type="submit" style={{ padding: "9px 16px", borderRadius: "var(--r-cell)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit" }}>
                            Add
                        </button>
                    </Form>
                </div>

                {/* ── Main settings form ── */}
                <Form method="post">
                    <input type="hidden" name="intent" value="save" />

                    <SectionLabel>Event Name</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "14px 16px", boxShadow: "var(--shadow)" }}>
                        <input name="name" defaultValue={tournament.name}
                            style={{ width: "100%", border: "none", background: "transparent", fontSize: "1.1rem", fontWeight: 600, fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                    </div>

                    <SectionLabel>Game Type</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {PLAY_TYPES.map((t, i) => (
                            <label key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < PLAY_TYPES.length - 1 ? "1px solid var(--sep)" : "none", cursor: "pointer" }}>
                                <span style={{ fontSize: "0.92rem", fontWeight: 500, color: "var(--label)" }}>{TYPE_LABELS[t] || t}</span>
                                <input type="radio" name="type" value={t} defaultChecked={tournament.type === t} style={{ accentColor: "var(--green)", width: 16, height: 16 }} />
                            </label>
                        ))}
                    </div>

                    <SectionLabel>Match Settings</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {[
                            { label: "Points per match", name: "pointsPerMatch", defaultValue: tournament.pointsPerMatch, min: 1, max: 99 },
                            { label: "Courts", name: "courts", defaultValue: tournament.courtsAvailable, min: 1, max: 20 },
                            { label: "Max players", name: "maxPlayers", defaultValue: tournament.maxPlayers || "", min: 4, max: 200, placeholder: "No limit" },
                        ].map((field, i, arr) => (
                            <div key={field.name} style={{ padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--sep)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{field.label}</span>
                                <input type="number" name={field.name} defaultValue={field.defaultValue}
                                    min={field.min} max={field.max} placeholder={field.placeholder}
                                    style={{ width: 80, textAlign: "right", border: "none", background: "transparent", fontSize: "0.95rem", fontWeight: 700, color: "var(--green)", fontFamily: "inherit", outline: "none" }} />
                            </div>
                        ))}
                        <div style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>40:40 Method</div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                {DEUCE_METHODS.map(d => (
                                    <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                        <input type="radio" name="deuceMethod" value={d} defaultChecked={tournament.deuceMethod === d} style={{ accentColor: "var(--green)" }} />
                                        <span style={{ fontSize: "0.84rem", color: "var(--label-2)" }}>{DEUCE_LABELS[d] || d}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <SectionLabel>Schedule</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Date & Time</div>
                            <input type="datetime-local" name="scheduledAt"
                                defaultValue={tournament.scheduledAt ? new Date(tournament.scheduledAt).toISOString().slice(0, 16) : ""}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Duration</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {[60, 90, 120, 150, 180].map(d => (
                                    <label key={d} style={{ cursor: "pointer" }}>
                                        <input type="radio" name="duration" value={String(d)} defaultChecked={(tournament.duration || 90) === d} style={{ display: "none" }} />
                                        <span style={{
                                            display: "inline-block", padding: "7px 12px", borderRadius: "var(--r-cell)",
                                            border: `2px solid ${(tournament.duration || 90) === d ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: (tournament.duration || 90) === d ? "var(--green)" : "var(--bg-grouped)",
                                            color: (tournament.duration || 90) === d ? "white" : "var(--label-2)",
                                            fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                                        }}>{d} min</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <SectionLabel>Entry Price</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "13px 16px", boxShadow: "var(--shadow)", display: "flex", gap: 12, alignItems: "center" }}>
                        <select name="currency" defaultValue={tournament.currency || "EUR"}
                            style={{ border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label-3)", outline: "none", fontWeight: 600, cursor: "pointer" }}>
                            {["EUR","USD","GBP","QAR","AED","SAR","CHF","SEK","NOK","DKK"].map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <input type="number" name="price" defaultValue={tournament.price || ""} min="0" step="0.01" placeholder="0 = free"
                            style={{ flex: 1, border: "none", background: "transparent", fontSize: "1.1rem", fontFamily: "inherit", color: "var(--label)", outline: "none", fontWeight: 600 }} />
                    </div>

                    <SectionLabel>Location</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {[
                            { label: "Venue Name", name: "location", defaultValue: tournament.location || "", placeholder: "e.g. Aspire Zone Padel" },
                            { label: "City / District", name: "city", defaultValue: tournament.city || "", placeholder: "e.g. Doha — Aspire Zone" },
                            { label: "Google Maps URL", name: "googleMapsUrl", defaultValue: tournament.googleMapsUrl || "", placeholder: "https://maps.app.goo.gl/...", type: "url" },
                        ].map((field, i, arr) => (
                            <div key={field.name} style={{ padding: "13px 16px", borderBottom: i < arr.length - 1 ? "1px solid var(--sep)" : "none" }}>
                                <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{field.label}</div>
                                <input name={field.name} defaultValue={field.defaultValue} placeholder={field.placeholder} type={field.type || "text"}
                                    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                            </div>
                        ))}
                        <div style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Country</div>
                            <select name="country" defaultValue={tournament.country || "OTHER"}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none", cursor: "pointer" }}>
                                {COUNTRIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <SectionLabel>Visibility</SectionLabel>
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {[
                            { val: "true", label: "Public", desc: "Listed on The Clubhouse" },
                            { val: "false", label: "Private", desc: "Only via link/code" },
                        ].map((opt, i) => (
                            <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", borderBottom: i === 0 ? "1px solid var(--sep)" : "none" }}>
                                <input type="radio" name="isPublic" value={opt.val} defaultChecked={String(tournament.isPublic) === opt.val} style={{ accentColor: "var(--green)", width: 16, height: 16 }} />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>{opt.label}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--label-3)" }}>{opt.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 32, marginBottom: 48 }}>
                        <Link to={`/app/play/tournament/${tournament.id}/overview`} style={{ flex: 1, textDecoration: "none" }}>
                            <button type="button" style={{ width: "100%", padding: "14px", borderRadius: "var(--r-card)", background: "var(--bg-card)", border: "1px solid var(--sep)", color: "var(--label-2)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                            </button>
                        </Link>
                        <button type="submit" disabled={isSubmitting}
                            style={{ flex: 2, padding: "14px", borderRadius: "var(--r-card)", background: isSubmitting ? "var(--sep-opaque)" : "var(--green)", color: "white", border: "none", fontWeight: 700, fontSize: "0.95rem", cursor: isSubmitting ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: isSubmitting ? "none" : "0 4px 16px rgba(28,79,53,0.3)" }}>
                            {isSubmitting ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </Form>
            </div>
        </>
    );
}
