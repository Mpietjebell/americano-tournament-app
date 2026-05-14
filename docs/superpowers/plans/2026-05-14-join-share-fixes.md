# Join Board Fixes, Share Page & Email Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bento card display (logo, spots language), host password wiring, share link landing page, and email position counting.

**Architecture:** Four independent changes across the Shopify liquid, two Remix routes, one utility file, and the creation form. Each task is self-contained and deployable on its own.

**Tech Stack:** Remix (React, loader/action), Prisma/SQLite, Resend email, Shopify Liquid (vanilla JS)

---

## File Map

| File | What changes |
|------|-------------|
| `shopify-custom-tournaments.liquid` | `cardUp()`: add logo, change spots label to "X spots left" |
| `app/routes/j.$code.jsx` | Full share page instead of redirect |
| `app/routes/app.play.tournament.new.jsx` | Make organiser inputs controlled; require hostPassword for public tournaments |
| `app/routes/api.public.tournaments.$id.signup.jsx` | Position = preset players + active participants + 1 |

---

## Task 1: Email position count fix

**Files:**
- Modify: `app/routes/api.public.tournaments.$id.signup.jsx` (line ~120)

**Context:** `currentCount` counts only `TournamentParticipant` records (public sign-ups). Host-preset `Player` records added at creation are ignored, so the first public registrant always gets position 1 even when the host pre-filled slots.

- [ ] **Step 1: Open the signup route and find the position line**

File: `app/routes/api.public.tournaments.$id.signup.jsx`

Look for: `const currentCount = activeCount;` followed by `const position = currentCount + 1;`

- [ ] **Step 2: Fix the position calculation**

Replace:
```js
const currentCount = activeCount;
```
With:
```js
const currentCount = activeCount; // public sign-ups only
```

Then replace:
```js
const position = currentCount + 1;
```
With:
```js
const position = tournament.players.length + currentCount + 1;
```

`tournament.players` is already included in the query (`include: { players: { select: { id: true } } }`). `tournament.players.length` = preset players added by host at creation.

- [ ] **Step 3: Verify manually**

Create a tournament with 3 preset players. Sign up as a new participant. Confirm the response JSON returns `position: 4` and the confirmation email says "You are spot **4** of X."

- [ ] **Step 4: Commit**

```bash
git add app/routes/api.public.tournaments.\$id.signup.jsx
git commit -m "fix: email position counts host-preset players toward total"
```

---

## Task 2: Host password — make organiser inputs controlled and required

**Files:**
- Modify: `app/routes/app.play.tournament.new.jsx`

**Context:** The three organiser inputs (`organizerName`, `hostPassword`, `hostEmail`) have `name` attributes but no `value`/`onChange`. They are uncontrolled. While Remix Form serialises uncontrolled inputs correctly, the password field has no `required` validation and no feedback — hosts often skip it, leaving `hostPassword: null` in the DB. When they later try the HOST button, `t.hostPassword && t.hostPassword === password` short-circuits on null and always fails.

- [ ] **Step 1: Add state variables for organiser fields**

In `app/routes/app.play.tournament.new.jsx`, find the state block (around line 475, after the `repeatWeekly` state). Add:

```jsx
const [organizerName, setOrganizerName] = useState("");
const [hostPassword, setHostPassword] = useState("");
const [hostEmail, setHostEmail] = useState("");
```

- [ ] **Step 2: Wire the organiser inputs as controlled**

Find the Organiser section (around line 1553). Replace the three uncontrolled inputs:

```jsx
{/* organizerName */}
<input
    name="organizerName"
    placeholder="e.g. Maikel"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```
→
```jsx
<input
    name="organizerName"
    value={organizerName}
    onChange={(e) => setOrganizerName(e.target.value)}
    placeholder="e.g. Maikel"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```

```jsx
{/* hostPassword */}
<input
    name="hostPassword"
    type="password"
    placeholder="Choose a password"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```
→
```jsx
<input
    name="hostPassword"
    type="password"
    value={hostPassword}
    onChange={(e) => setHostPassword(e.target.value)}
    placeholder="Choose a password"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```

```jsx
{/* hostEmail */}
<input
    name="hostEmail"
    type="email"
    placeholder="you@example.com"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```
→
```jsx
<input
    name="hostEmail"
    type="email"
    value={hostEmail}
    onChange={(e) => setHostEmail(e.target.value)}
    placeholder="you@example.com"
    style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
/>
```

- [ ] **Step 3: Add server-side validation for public tournaments**

In the `action` function, find the existing validation block (around line 53):
```js
if (isPublic && !googleMapsUrl) {
    return json({ error: "A Google Maps URL is required for public tournaments." }, { status: 400 });
}
```

Add after it:
```js
if (isPublic && !hostPassword) {
    return json({ error: "A host password is required for public tournaments." }, { status: 400 });
}
```

- [ ] **Step 4: Add a visual required indicator to the password label**

Find the Host Password label in the Organiser section:
```jsx
Host Password <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--label-3)", fontWeight: 400 }}>— remember this to start the match or make changes</span>
```

Change to:
```jsx
Host Password {isPublic && <span style={{ fontSize: "0.6rem", background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 4, padding: "1px 5px", fontWeight: 700, marginLeft: 4 }}>Required</span>} <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--label-3)", fontWeight: 400 }}>— remember this to start the match or make changes</span>
```

- [ ] **Step 5: Commit**

```bash
git add app/routes/app.play.tournament.new.jsx
git commit -m "fix: make organiser inputs controlled, require hostPassword for public tournaments"
```

---

## Task 3: Liquid — logo on card + spots language

**Files:**
- Modify: `shopify-custom-tournaments.liquid`

**Context:** Two display fixes in `cardUp()`. Logo is already in the API response (`t.logoUrl`) but never rendered on the card itself. Spots row says "3 signed up / 4 spots" — change left side to "X spots left".

- [ ] **Step 1: Fix spots language in `cardUp()`**

Find in `cardUp()`:
```js
var rowRight=waitlist>0?(waitlist+' on waitlist'):t.maxPlayers+' spots';
spotsHtml='<div class="nopa-spots-wrap">'
  +'<div class="nopa-spots-row"><span>'+active+' signed up</span><span>'+rowRight+'</span></div>'
```

Replace with:
```js
var spotsLeft=t.maxPlayers-active;
var rowLeft=spotsLeft>0?(spotsLeft+' spots left'):'Full';
var rowRight=waitlist>0?(waitlist+' on waitlist'):'';
spotsHtml='<div class="nopa-spots-wrap">'
  +'<div class="nopa-spots-row"><span>'+rowLeft+'</span>'+(rowRight?'<span>'+rowRight+'</span>':'')+'</div>'
```

- [ ] **Step 2: Add logo to card header in `cardUp()`**

Find in `cardUp()`:
```js
return '<div class="nopa-card" onclick="nopaOpenDetail(\''+t.id+'\')" style="position:relative">'
  +levelDotsHtml(t.level,false)
  +'<button onclick="event.stopPropagation();nopaHostPrompt(\''+t.id+'\')"'
```

Add logo HTML between the level dots and the HOST button:
```js
var logoHtml=t.logoUrl?('<img src="'+esc(t.logoUrl)+'" alt="" style="position:absolute;top:10px;left:48px;width:28px;height:28px;border-radius:6px;object-fit:cover;border:1.5px solid rgba(255,255,255,.25);z-index:1">'):'';
return '<div class="nopa-card" onclick="nopaOpenDetail(\''+t.id+'\')" style="position:relative">'
  +levelDotsHtml(t.level,false)
  +logoHtml
  +'<button onclick="event.stopPropagation();nopaHostPrompt(\''+t.id+'\')"'
```

- [ ] **Step 3: Paste updated liquid into Shopify admin**

Copy the full contents of `shopify-custom-tournaments.liquid` and paste into Shopify admin → Online Store → Themes → Edit code → Sections → `shopify-custom-tournaments.liquid`. Save.

This re-paste also fixes level dots and bar fill (already correct in code, just needed a re-paste).

- [ ] **Step 4: Commit**

```bash
git add shopify-custom-tournaments.liquid  # (run from homepagenopa1 root, not organise-americano)
```

Since `shopify-custom-tournaments.liquid` is outside the git repo at `organise-americano/`, no git commit is needed for this file — it lives only in Shopify admin.

---

## Task 4: Share page — standalone Railway page at `play.nopabrand.com/j/CODE`

**Files:**
- Modify: `app/routes/j.$code.jsx` (currently a one-line redirect, replace entirely)

**Context:** Currently redirects to the Shopify page. Replace with a full server-rendered Remix page that fetches tournament data directly from the DB and renders a mobile-first landing page with bento card + player list + sticky join button.

- [ ] **Step 1: Replace `j.$code.jsx` with a full page**

Replace the entire file content:

```jsx
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";

const SHOPIFY_JOIN_BASE = "https://nopabrand.com/pages/organise-americano";
const LABELS = { americano: "Americano", mexicano: "Mexicano", team_americano: "Team Americano", team_mexicano: "Team Mexicano", king_of_the_court: "King of the Court", beat_the_box: "Beat the Box" };
const LEVEL_TOOLTIP = ["", "Playtomic 0–1 · Beginner", "Playtomic 0–1.5 · Recreational", "Playtomic 2–3 · Intermediate", "Playtomic 3–4 · Advanced", "Playtomic 4+ · Competitive"];

export const loader = async ({ params }) => {
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
    });
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

    // Build player rows: filled names + open slots
    const rows = [];
    for (let i = 0; i < (t.playerNames.length); i++) {
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
            {!t.isPast && (
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
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify the page renders correctly**

With the Railway dev server running (`npm run dev` inside `organise-americano/`), visit `http://localhost:PORT/j/SOMECODE` with a valid join code from your DB. Confirm:
- Bento card renders with correct details
- Player list shows registered names + open slots
- Sticky button appears at the bottom
- Button links to `https://nopabrand.com/pages/organise-americano?join=CODE`

- [ ] **Step 3: Commit and push**

```bash
git add app/routes/j.\$code.jsx
git commit -m "feat: share landing page at /j/:code — bento card, player list, sticky join button"
git push origin main
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Task 1 = email fix ✓, Task 2 = host password ✓, Task 3 = liquid logo + spots ✓, Task 4 = share page ✓
- [x] **Placeholders:** None — all code blocks are complete
- [x] **Type consistency:** `t.playerCount`, `t.maxPlayers`, `t.standbyCount` match API field names from `api.public.tournaments.jsx` serialize()
- [x] **Bar fill logic in share page** mirrors `barSegments()` from liquid — consistent calculation
- [x] **Logo position in liquid Task 3** uses `left: 48px` to avoid collision with the flag emoji in the header
