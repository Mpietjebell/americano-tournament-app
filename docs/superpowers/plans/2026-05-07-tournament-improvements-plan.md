# Tournament Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add duration field, improved WhatsApp text, waitlist system, cancel registration, host-only round generation, host edit dashboard, and short join URL redirect.

**Architecture:** All changes are in the Remix app (`organise-americano/`). DB changes via a single Prisma migration. New routes for short redirect, deregister action, and host edit. Existing routes updated for host/non-host branching and waitlist logic.

**Tech Stack:** Remix, Prisma/SQLite, Railway, inline CSS (no Tailwind), Resend email

---

## File Map

**New files:**
- `prisma/migrations/20260507000000_add_duration_standby/migration.sql`
- `app/routes/j.$code.jsx` — short redirect `/j/CODE` → Shopify join page
- `app/routes/api.tournament.$id.deregister.jsx` — cancel registration POST action
- `app/routes/app.play.tournament.$id.edit.jsx` — host edit dashboard

**Modified files:**
- `prisma/schema.prisma` — add `duration Int?` to Tournament, `standbyPosition Int?` to TournamentParticipant
- `app/utils/tournament-helpers.js` — update `buildJoinInviteText`
- `app/utils/email.server.js` — add waitlist promotion, standby notification, location/price change emails
- `app/routes/app.play.tournament.new.jsx` — add duration preset picker in Schedule section
- `app/routes/app.play.join.$code.jsx` — default to list, empty name tile, waitlist display, cancel button
- `app/routes/api.public.tournaments.$id.signup.jsx` — waitlist logic
- `app/routes/app.play.tournament.$id.jsx` — host-only generate button, non-host waiting view
- `app/routes/app.play.tournament.$id.player.jsx` — add cancel registration button
- `app/routes/app.play.tournament.$id.overview.jsx` — add Edit Tournament button

---

## Task 1: DB Migration — duration + standbyPosition

**Files:**
- Create: `prisma/migrations/20260507000000_add_duration_standby/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Create migration file**

```bash
mkdir -p prisma/migrations/20260507000000_add_duration_standby
```

Create `prisma/migrations/20260507000000_add_duration_standby/migration.sql`:
```sql
ALTER TABLE "Tournament" ADD COLUMN "duration" INTEGER;
ALTER TABLE "TournamentParticipant" ADD COLUMN "standbyPosition" INTEGER;
```

- [ ] **Step 2: Update schema.prisma**

In `prisma/schema.prisma`, add to the `Tournament` model after `maxPlayers`:
```prisma
duration          Int?
```

Add to `TournamentParticipant` model after `noShow`:
```prisma
standbyPosition   Int?
```

- [ ] **Step 3: Apply migration**

```bash
cd organise-americano
npx prisma migrate deploy
```

Expected: `1 migration applied`

- [ ] **Step 4: Verify**

```bash
npx prisma studio
```

Open browser, confirm `Tournament` has `duration` column and `TournamentParticipant` has `standbyPosition` column.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260507000000_add_duration_standby/
git commit -m "db: add duration to Tournament, standbyPosition to TournamentParticipant"
```

---

## Task 2: Short Redirect Route `/j/:code`

**Files:**
- Create: `app/routes/j.$code.jsx`

- [ ] **Step 1: Create the route**

Create `app/routes/j.$code.jsx`:
```jsx
import { redirect } from "@remix-run/node";

export const loader = ({ params }) => {
    return redirect(
        `https://nopabrand.com/pages/organise-americano?join=${params.code.toUpperCase()}`,
        { status: 302 }
    );
};
```

- [ ] **Step 2: Verify manually**

Deploy or run locally. Visit `http://localhost:PORT/j/TESTCODE` — should redirect to `https://nopabrand.com/pages/organise-americano?join=TESTCODE`.

- [ ] **Step 3: Commit**

```bash
git add app/routes/j.$code.jsx
git commit -m "feat: add /j/:code short redirect to Shopify join page"
```

---

## Task 3: WhatsApp Text — Emojis + Duration + End Time

**Files:**
- Modify: `app/utils/tournament-helpers.js`

- [ ] **Step 1: Replace `buildJoinInviteText`**

In `app/utils/tournament-helpers.js`, replace the entire `buildJoinInviteText` function:

```js
export function buildJoinInviteText(tournament, joinUrl) {
    const typeLabel = TYPE_LABELS[tournament.type] || tournament.type;
    const city = tournament.city || tournament.venue?.city || "";
    const locationParts = [city, tournament.venue?.name || tournament.location || ""].filter(Boolean);
    const locationLine = locationParts.join(" · ");

    let dateLine = "";
    let timeLine = "";
    if (tournament.scheduledAt) {
        const d = new Date(tournament.scheduledAt);
        dateLine = d.toLocaleDateString("en-GB", {
            weekday: "long", day: "numeric", month: "2-digit", year: "numeric",
        });
        const startTime = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        if (tournament.duration) {
            const endD = new Date(d.getTime() + tournament.duration * 60000);
            const endTime = endD.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            timeLine = `⏰ ${startTime} - ${endTime}`;
        } else {
            timeLine = `⏰ ${startTime}`;
        }
    }

    const priceLine = tournament.price
        ? `💸 Price ${tournament.price} ${tournament.currency || ""}`.trim()
        : "Free entry";
    const playerLine = tournament.maxPlayers
        ? `${tournament.maxPlayers} player ${typeLabel} tournament`
        : `${typeLabel} tournament`;

    const lines = [
        `🎾 "${tournament.name}"`,
        locationLine,
        dateLine,
        timeLine,
        playerLine,
        priceLine,
    ];

    if (tournament.googleMapsUrl) lines.push(`📍 ${tournament.googleMapsUrl}`);
    lines.push(`Join code: ${tournament.joinCode}`);
    lines.push(joinUrl);
    lines.push("Powered by NOPA Padel");

    return lines.filter(Boolean).join("\n");
}
```

Note: Unicode escapes used instead of emoji literals for safety:
- `🎾` = 🎾
- `⏰` = ⏰ (use instead of 🕰️ for wider support)
- `💸` = 💸
- `📍` = 📍

- [ ] **Step 2: Update overview.jsx to use `play.nopabrand.com/j/CODE`**

In `app/routes/app.play.tournament.$id.overview.jsx`, change:
```js
const PUBLIC_SITE = "https://nopabrand.com/pages/organise-americano";
const publicJoinUrl = `${PUBLIC_SITE}?join=${tournament.joinCode}`;
```
to:
```js
const publicJoinUrl = `https://play.nopabrand.com/j/${tournament.joinCode}`;
```

- [ ] **Step 3: Update share.jsx to use short URL**

In `app/routes/app.play.tournament.$id.share.jsx`, change:
```js
const PUBLIC_SITE = "https://nopabrand.com/pages/organise-americano";
// ...
const joinUrl = `${PUBLIC_SITE}?join=${tournament.joinCode}`;
```
to:
```js
const joinUrl = `https://play.nopabrand.com/j/${tournament.joinCode}`;
```

- [ ] **Step 4: Commit**

```bash
git add app/utils/tournament-helpers.js app/routes/app.play.tournament.$id.overview.jsx app/routes/app.play.tournament.$id.share.jsx
git commit -m "feat: update WhatsApp text with emojis, duration end time, short URL"
```

---

## Task 4: Duration Picker in Tournament Creation Form

**Files:**
- Modify: `app/routes/app.play.tournament.new.jsx`

- [ ] **Step 1: Add duration state**

In `app/routes/app.play.tournament.new.jsx`, in the state declarations block add:
```js
const [duration, setDuration] = useState(90);
```

- [ ] **Step 2: Add duration picker UI**

In the Schedule section, after the minute selector block (after `</div>` that closes the time section), add before the summary line div:

```jsx
{/* Duration */}
<div style={{ padding: "0 16px 14px", borderBottom: "1px solid var(--sep)" }}>
    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 10, fontWeight: 600 }}>
        Est. Duration
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[60, 90, 120, 150, 180].map(d => (
            <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                style={{
                    padding: "8px 14px", borderRadius: "var(--r-cell)",
                    border: `2px solid ${duration === d ? "var(--green)" : "var(--sep-opaque)"}`,
                    background: duration === d ? "var(--green)" : "var(--bg-grouped)",
                    color: duration === d ? "white" : "var(--label-2)",
                    fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.15s",
                }}
            >{d} min</button>
        ))}
    </div>
    <input type="hidden" name="duration" value={duration} />
</div>
```

- [ ] **Step 3: Read duration in action**

In the `action` function of `app.play.tournament.new.jsx`, add after `const maxPlayers = ...`:
```js
const duration = formData.get("duration") ? parseInt(formData.get("duration"), 10) : null;
```

Add `duration` to the `prisma.tournament.create` data object:
```js
duration: duration || null,
```

- [ ] **Step 4: Commit**

```bash
git add app/routes/app.play.tournament.new.jsx
git commit -m "feat: add duration picker to tournament creation schedule section"
```

---

## Task 5: Email Helpers for New Events

**Files:**
- Modify: `app/utils/email.server.js`

- [ ] **Step 1: Add waitlist promotion email**

Append to `app/utils/email.server.js`:

```js
export async function sendStandbyPromoted({ to, name, tournament }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || tournament.venue?.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");
    const dateStr = tournament.scheduledAt
        ? new Date(tournament.scheduledAt).toLocaleString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
          })
        : "";

    await send({
        to,
        subject: `A spot opened — you're in! ${tournament.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.2rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Good news, ${name}!</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">A spot opened up in <strong>${tournament.name}</strong> and you're first on the standby list — you're now confirmed!</p>
          ${locationLine ? `<p style="font-size:0.88rem;color:#1C4F35;font-weight:600">📍 ${locationLine}</p>` : ""}
          ${dateStr ? `<p style="font-size:0.88rem;color:#333;font-weight:600">📅 ${dateStr}</p>` : ""}
          ${tournament.googleMapsUrl ? `<p><a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600;font-size:0.88rem">Open in Google Maps →</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
}

export async function sendStandbyHostNotification({ to, tournament, standbyCount }) {
    await send({
        to,
        subject: `${standbyCount} players on standby — ${tournament.name}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white;letter-spacing:0.15em">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.2rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Standby list update</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6"><strong>${standbyCount} players</strong> are now on the standby list for <strong>${tournament.name}</strong>. Consider adding more slots or letting them know.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
}

export async function sendLocationChanged({ participants, tournament }) {
    const venueName = tournament.venue?.name || tournament.location || "";
    const city = tournament.city || "";
    const locationLine = [venueName, city].filter(Boolean).join(", ");

    await Promise.all(participants.map(({ email, name }) =>
        send({
            to: email,
            subject: `Venue update — ${tournament.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.1rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Venue updated, ${name || "player"}</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">The venue for <strong>${tournament.name}</strong> has been updated.</p>
          <p style="font-size:0.95rem;color:#1C4F35;font-weight:600">📍 ${locationLine}</p>
          ${tournament.googleMapsUrl ? `<p><a href="${tournament.googleMapsUrl}" style="color:#1C4F35;font-weight:600">Open in Google Maps →</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        })
    ));
}

export async function sendPriceChanged({ participants, tournament }) {
    await Promise.all(participants.map(({ email, name }) =>
        send({
            to: email,
            subject: `Price update — ${tournament.name}`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:white;border-radius:16px;overflow:hidden">
        <tr><td style="background:#1C4F35;padding:24px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:white">NOPA</div>
        </td></tr>
        <tr><td style="padding:24px">
          <div style="font-size:1.1rem;font-weight:700;color:#1a1a1a;margin-bottom:8px">Price updated, ${name || "player"}</div>
          <p style="font-size:0.9rem;color:#666;line-height:1.6">The entry price for <strong>${tournament.name}</strong> has been updated to <strong>${tournament.price ? `${tournament.price} ${tournament.currency || ""}` : "Free"}</strong>.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
          <div style="font-size:0.72rem;color:#bbb">Powered by <strong style="color:#1C4F35">NOPA Padel</strong></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
        })
    ));
}
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/email.server.js
git commit -m "feat: add standby promotion, host notification, location/price change emails"
```

---

## Task 6: Waitlist Logic in Public Signup

**Files:**
- Modify: `app/routes/api.public.tournaments.$id.signup.jsx`

- [ ] **Step 1: Add waitlist logic to action**

In `api.public.tournaments.$id.signup.jsx`, replace the section after the `alreadySignedUp` check through the end of the transaction block with:

```js
// Count active participants (standbyPosition IS null)
const activeCount = await prisma.tournamentParticipant.count({
    where: { tournamentId: tournament.id, standbyPosition: null },
});

const isFull = tournament.maxPlayers != null && activeCount >= tournament.maxPlayers;

if (isFull) {
    // Check if already on standby
    const alreadyStandby = tournament.participants.some(p => p.email === email && p.standbyPosition != null);
    if (alreadyStandby) {
        return corsJson(request, { error: "You are already on the standby list.", code: "already_signed_up" }, { status: 409 });
    }

    // Get next standby position
    const maxStandby = await prisma.tournamentParticipant.aggregate({
        where: { tournamentId: tournament.id, standbyPosition: { not: null } },
        _max: { standbyPosition: true },
    });
    const nextPosition = (maxStandby._max.standbyPosition ?? 0) + 1;

    // Create player record (needed for cookie) and standby participant
    const [standbyPlayer, standbyParticipant] = await prisma.$transaction([
        prisma.player.create({
            data: { name, gender: "unspecified", tournamentId: tournament.id },
        }),
        prisma.tournamentParticipant.create({
            data: { email, phone, name, tournamentId: tournament.id, standbyPosition: nextPosition },
        }),
    ]);

    await prisma.tournamentParticipant.update({
        where: { id: standbyParticipant.id },
        data: { playerId: standbyPlayer.id },
    });

    // Notify host at 4 standby players
    if (nextPosition === 4) {
        const hostParticipant = await prisma.tournamentParticipant.findFirst({
            where: { tournamentId: tournament.id, standbyPosition: null },
            orderBy: { id: "asc" },
        });
        // We don't store host email separately — skip for now, host sees it in dashboard
    }

    return corsJson(request, {
        ok: true,
        standby: true,
        position: nextPosition,
        message: `You're on standby — position ${nextPosition}. You'll be emailed if a spot opens!`,
    });
}

// Active signup (existing code below — no change needed from currentCount check)
```

Remove the old `currentCount >= tournament.maxPlayers` check since it's now handled above.

- [ ] **Step 2: Update success response to include standby flag**

The Shopify liquid `nopaSubmitSignup` function already handles `res.data.message`. No liquid changes needed — the standby message will display correctly.

- [ ] **Step 3: Commit**

```bash
git add app/routes/api.public.tournaments.$id.signup.jsx
git commit -m "feat: add waitlist/standby logic to public signup"
```

---

## Task 7: Cancel Registration Action

**Files:**
- Create: `app/routes/api.tournament.$id.deregister.jsx`

- [ ] **Step 1: Create deregister route**

Create `app/routes/api.tournament.$id.deregister.jsx`:

```jsx
import { json, redirect } from "@remix-run/node";
import prisma from "../db.server";
import { sendStandbyPromoted } from "../utils/email.server";

export async function action({ request, params }) {
    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const formData = await request.formData();
    const playerId = formData.get("playerId");

    if (!playerId) return json({ error: "Player ID required" }, { status: 400 });

    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: {
            participants: { orderBy: { standbyPosition: "asc" } },
            venue: true,
        },
    });
    if (!tournament) return json({ error: "Tournament not found" }, { status: 404 });
    if (tournament.status !== "setup") {
        return json({ error: "Cannot deregister after the tournament has started." }, { status: 409 });
    }

    // Find the participant record for this player
    const participant = await prisma.tournamentParticipant.findFirst({
        where: { tournamentId: params.id, playerId },
    });

    // Delete player + participant
    await prisma.$transaction([
        prisma.player.delete({ where: { id: playerId } }),
        ...(participant ? [prisma.tournamentParticipant.delete({ where: { id: participant.id } })] : []),
    ]);

    // Promote first standby if any
    const firstStandby = tournament.participants.find(
        p => p.standbyPosition != null && p.standbyPosition === 1 && p.playerId !== playerId
    );

    if (firstStandby) {
        // Create a player record for them (they only had a participant record)
        const promotedPlayer = await prisma.player.create({
            data: { name: firstStandby.name, gender: "unspecified", tournamentId: params.id },
        });

        // Update their participant: clear standby, link new player
        await prisma.tournamentParticipant.update({
            where: { id: firstStandby.id },
            data: { standbyPosition: null, playerId: promotedPlayer.id },
        });

        // Shift all remaining standby positions down by 1
        await prisma.tournamentParticipant.updateMany({
            where: { tournamentId: params.id, standbyPosition: { gt: 1 } },
            data: { standbyPosition: { decrement: 1 } },
        });

        // Email the promoted player
        if (firstStandby.email) {
            sendStandbyPromoted({
                to: firstStandby.email,
                name: firstStandby.name,
                tournament,
            }).catch(() => {});
        }
    }

    // Clear player cookie
    const cookieName = `nopa_player_${params.id}`;
    return redirect(`/app/play/join/${tournament.joinCode}`, {
        headers: {
            "Set-Cookie": `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`,
        },
    });
}

export async function loader() {
    return json({ error: "POST only" }, { status: 405 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/api.tournament.$id.deregister.jsx
git commit -m "feat: add deregister action with standby promotion"
```

---

## Task 8: Cancel Button on Join Page and Player Page

**Files:**
- Modify: `app/routes/app.play.join.$code.jsx`
- Modify: `app/routes/app.play.tournament.$id.player.jsx`

- [ ] **Step 1: Add cancel button + confirmation to join page**

In `app/routes/app.play.join.$code.jsx`, add state:
```jsx
const [showCancelConfirm, setShowCancelConfirm] = useState(false);
```

Add this helper at the top of the component (after existing state):
```jsx
// Get player ID from cookie if already registered
const alreadyJoined = tournament.participants?.find(
    p => p.standbyPosition == null
);
```

Add this JSX after the wrong-event paragraph at the bottom:
```jsx
{/* Cancel Registration */}
{showCancelConfirm ? (
    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-card)", padding: "20px", marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "#991b1b", marginBottom: 8 }}>
            Are you sure you want to deregister from this tournament?
        </div>
        <p style={{ fontSize: "0.84rem", color: "#b91c1c", marginBottom: 16, lineHeight: 1.5 }}>
            This action cannot be undone. If there are players on standby, the first one will take your spot.
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
        style={{ width: "100%", padding: "13px", marginTop: 20, borderRadius: "var(--r-card)", background: "transparent", border: "2px solid #dc2626", color: "#dc2626", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
        Cancel Registration
    </button>
)}
```

You'll also need to expose `playerIdFromCookie` — read it from the loader. Update the loader to include participant info:
```js
// In loader, add to return:
const cookie = request.headers.get("Cookie") || "";
const cookieMatch = cookie.match(new RegExp(`nopa_player_${tournament.id}=([^;]+)`));
const playerIdFromCookie = cookieMatch?.[1] || null;
return json({ tournament, playerIdFromCookie });
```

And in the component:
```jsx
const { tournament, playerIdFromCookie } = useLoaderData();
```

Only show the Cancel Registration button if `playerIdFromCookie` is set.

- [ ] **Step 2: Add cancel button to player view page**

In `app/routes/app.play.tournament.$id.player.jsx`, add at the top:
```jsx
import { Form } from "@remix-run/react";
```

Add state:
```jsx
const [showCancelConfirm, setShowCancelConfirm] = useState(false);
```

Add at the bottom of the page JSX, before the closing `</>`:
```jsx
{/* Cancel Registration — only before tournament starts */}
{!isFinished && tournament.status === "setup" && playerId && (
    <div style={{ padding: "0 16px 32px" }}>
        {showCancelConfirm ? (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-card)", padding: "20px" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#991b1b", marginBottom: 8 }}>
                    Are you sure you want to deregister from this tournament?
                </div>
                <p style={{ fontSize: "0.84rem", color: "#b91c1c", marginBottom: 16, lineHeight: 1.5 }}>
                    If there are players on standby, the first one will take your spot.
                </p>
                <Form method="post" action={`/api/tournament/${tournament.id}/deregister`}>
                    <input type="hidden" name="playerId" value={playerId} />
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
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.join.$code.jsx app/routes/app.play.tournament.$id.player.jsx
git commit -m "feat: add Cancel Registration button with confirmation to join and player pages"
```

---

## Task 9: Join Page — Default to List + Empty Name Tile

**Files:**
- Modify: `app/routes/app.play.join.$code.jsx`

- [ ] **Step 1: Change default nameMode to "list"**

In `app/routes/app.play.join.$code.jsx`, change:
```jsx
const [nameMode, setNameMode] = useState("new");
```
to:
```jsx
const [nameMode, setNameMode] = useState("list");
```

- [ ] **Step 2: Add empty name tile at bottom of player grid**

In the player grid section (`nameMode === "list"`), after the `tournament.players.map(...)` block and before closing `</div>`, add:

```jsx
{/* Empty slot — add your name */}
<button
    type="button"
    onClick={() => { setNameMode("new"); setSelectedPlayer(""); }}
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
    <div style={{ fontSize: "1.2rem" }}>+</div>
    <div style={{ fontSize: "0.78rem" }}>Add your name</div>
</button>
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.join.$code.jsx
git commit -m "feat: default join page to Pick from list, add empty name tile"
```

---

## Task 10: Host-Only Generate Button + Non-Host Waiting View

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Find the generate button render section**

Search for `Generate All` in `app/routes/app.play.tournament.$id.jsx`. The generate button is rendered inside a `setup` status block.

- [ ] **Step 2: Wrap generate section in `isHost` check**

Find the generate button JSX block (contains "Ready to play?" or "Generate All Rounds") and wrap it:

```jsx
{isHost ? (
    /* existing generate button block — no changes inside */
    <div>...existing generate JSX...</div>
) : (
    /* Non-host waiting view */
    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "28px 20px", textAlign: "center", boxShadow: "var(--shadow)", marginBottom: 20 }}>
        <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--label)", marginBottom: 8 }}>
            Waiting for the host to start the tournament
        </div>
        <p style={{ fontSize: "0.84rem", color: "var(--label-3)", lineHeight: 1.6, marginBottom: 0 }}>
            The host will generate the matches when everyone is ready. You'll see the courts appear here.
        </p>
    </div>
)}
```

- [ ] **Step 3: Add player list for non-hosts in setup view**

After the waiting view block, add (still inside `tournament.status === "setup"` and `!isHost`):

```jsx
{!isHost && tournament.status === "setup" && (
    <>
        <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "16px 18px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>
                Signed up ({tournament.players.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tournament.players.map(p => (
                    <span key={p.id} style={{
                        background: "var(--bg-fill-2)", borderRadius: "var(--r-pill)",
                        padding: "6px 14px", fontSize: "0.84rem", fontWeight: 500, color: "var(--label-2)",
                    }}>{p.name}</span>
                ))}
            </div>
        </div>
        {/* Cancel Registration for non-host player */}
        {playerId && <CancelRegistrationButton tournamentId={tournament.id} playerId={playerId} />}
    </>
)}
```

Create `CancelRegistrationButton` as a small component at the top of the file:

```jsx
function CancelRegistrationButton({ tournamentId, playerId }) {
    const [showConfirm, setShowConfirm] = React.useState(false);
    return showConfirm ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-card)", padding: "20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#991b1b", marginBottom: 8 }}>
                Are you sure you want to deregister from this tournament?
            </div>
            <p style={{ fontSize: "0.84rem", color: "#b91c1c", marginBottom: 16 }}>
                If there are players on standby, the first one will take your spot.
            </p>
            <Form method="post" action={`/api/tournament/${tournamentId}/deregister`}>
                <input type="hidden" name="playerId" value={playerId} />
                <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={() => setShowConfirm(false)}
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
        <button type="button" onClick={() => setShowConfirm(true)}
            style={{ width: "100%", padding: "13px", marginBottom: 16, borderRadius: "var(--r-card)", background: "transparent", border: "2px solid #dc2626", color: "#dc2626", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel Registration
        </button>
    );
}
```

Add `import React from "react";` and `import { Form } from "@remix-run/react";` if not already present.

- [ ] **Step 4: Expose `playerId` in loader**

In the loader of `app.play.tournament.$id.jsx`, add:
```js
const cookie = request.headers.get("Cookie") || "";
const playerCookieMatch = cookie.match(new RegExp(`nopa_player_${params.id}=([^;]+)`));
const playerId = playerCookieMatch?.[1] || null;
```

Return it: `return json({ tournament, isHost, origin, playerId });`

In the component: `const { tournament, isHost, origin, playerId } = useLoaderData();`

- [ ] **Step 5: Commit**

```bash
git add app/routes/app.play.tournament.$id.jsx
git commit -m "feat: host-only generate button, non-host waiting view with player list and cancel"
```

---

## Task 11: Host Edit Dashboard

**Files:**
- Create: `app/routes/app.play.tournament.$id.edit.jsx`
- Modify: `app/routes/app.play.tournament.$id.overview.jsx`

- [ ] **Step 1: Create the edit route**

Create `app/routes/app.play.tournament.$id.edit.jsx`:

```jsx
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, Form, Link } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { validateHostToken } from "../utils/host-auth.server";
import { sendLocationChanged, sendPriceChanged } from "../utils/email.server";
import { TYPE_LABELS, DEUCE_LABELS } from "../utils/tournament-helpers";

const COUNTRIES = [
    { code: "NL", name: "Netherlands", flag: "🇳🇱" },
    { code: "QA", name: "Qatar", flag: "🇶🇦" },
    { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
    { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "DE", name: "Germany", flag: "🇩🇪" },
    { code: "ES", name: "Spain", flag: "🇪🇸" },
    { code: "FR", name: "France", flag: "🇫🇷" },
    { code: "BE", name: "Belgium", flag: "🇧🇪" },
    { code: "OTHER", name: "Other", flag: "🌍" },
];

export const loader = async ({ params, request }) => {
    const tournament = await prisma.tournament.findUnique({
        where: { id: params.id },
        include: { players: true, participants: true, venue: true },
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
        const name = formData.get("newPlayerName")?.toString().trim();
        if (!name) return json({ error: "Player name required" });
        await prisma.player.create({
            data: { name, gender: "unspecified", tournamentId: params.id },
        });
        return json({ ok: true });
    }

    // Full settings save
    const name = formData.get("name")?.toString().trim();
    const type = formData.get("type");
    const courts = parseInt(formData.get("courts"), 10) || tournament.courtsAvailable;
    const pointsPerMatch = parseInt(formData.get("pointsPerMatch"), 10) || tournament.pointsPerMatch;
    const deuceMethod = formData.get("deuceMethod") || tournament.deuceMethod;
    const maxPlayers = formData.get("maxPlayers") ? parseInt(formData.get("maxPlayers"), 10) : tournament.maxPlayers;
    const price = formData.get("price") ? parseFloat(formData.get("price")) : null;
    const currency = formData.get("currency") || tournament.currency;
    const city = formData.get("city") || null;
    const country = formData.get("country") || tournament.country;
    const googleMapsUrl = formData.get("googleMapsUrl") || null;
    const location = formData.get("location") || tournament.location;
    const isPublic = formData.get("isPublic") !== "false";
    const scheduledAtStr = formData.get("scheduledAt") || null;
    const duration = formData.get("duration") ? parseInt(formData.get("duration"), 10) : null;

    const locationChanged = googleMapsUrl !== tournament.googleMapsUrl || city !== tournament.city || location !== tournament.location;
    const priceChanged = price !== tournament.price || currency !== tournament.currency;

    await prisma.tournament.update({
        where: { id: params.id },
        data: {
            name: name || tournament.name,
            type, courts, pointsPerMatch, deuceMethod,
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

export default function EditTournament() {
    const { tournament } = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const [newPlayerName, setNewPlayerName] = useState("");

    const sectionLabel = (text) => (
        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, marginTop: 24, fontWeight: 600 }}>
            {text}
        </div>
    );

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
                <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>Edit Mode — changes take effect immediately</span>
            </div>

            <div className="ios-page">
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.8rem", fontWeight: 400, color: "var(--label)", marginBottom: 4 }}>
                    Edit Tournament
                </h1>
                <p style={{ fontSize: "0.82rem", color: "var(--label-3)", marginBottom: 24 }}>{tournament.name}</p>

                {actionData?.error && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-cell)", padding: "12px 16px", marginBottom: 20, color: "#991b1b", fontSize: "0.88rem" }}>
                        {actionData.error}
                    </div>
                )}

                <Form method="post">
                    <input type="hidden" name="intent" value="save" />

                    {sectionLabel("Event Name")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "14px 16px", marginBottom: 0, boxShadow: "var(--shadow)" }}>
                        <input
                            name="name"
                            defaultValue={tournament.name}
                            style={{ width: "100%", border: "none", background: "transparent", fontSize: "1.1rem", fontWeight: 600, fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                        />
                    </div>

                    {sectionLabel("Game Type")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {PLAY_TYPES.map((t, i) => (
                            <label key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: i < PLAY_TYPES.length - 1 ? "1px solid var(--sep)" : "none", cursor: "pointer" }}>
                                <span style={{ fontSize: "0.92rem", fontWeight: 500, color: "var(--label)" }}>{TYPE_LABELS[t] || t}</span>
                                <input type="radio" name="type" value={t} defaultChecked={tournament.type === t} style={{ accentColor: "var(--green)", width: 16, height: 16 }} />
                            </label>
                        ))}
                    </div>

                    {sectionLabel("Match Settings")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.85rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "0.62rem" }}>Points per match</span>
                            <input type="number" name="pointsPerMatch" defaultValue={tournament.pointsPerMatch} min="1" max="99"
                                style={{ width: 64, textAlign: "right", border: "none", background: "transparent", fontSize: "0.95rem", fontWeight: 700, color: "var(--green)", fontFamily: "inherit", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Courts</span>
                            <input type="number" name="courts" defaultValue={tournament.courtsAvailable} min="1" max="20"
                                style={{ width: 64, textAlign: "right", border: "none", background: "transparent", fontSize: "0.95rem", fontWeight: 700, color: "var(--green)", fontFamily: "inherit", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Max players</span>
                            <input type="number" name="maxPlayers" defaultValue={tournament.maxPlayers || ""} min="4" max="200" placeholder="No limit"
                                style={{ width: 80, textAlign: "right", border: "none", background: "transparent", fontSize: "0.95rem", fontWeight: 700, color: "var(--green)", fontFamily: "inherit", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>40:40 Method</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {DEUCE_METHODS.map(d => (
                                    <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                        <input type="radio" name="deuceMethod" value={d} defaultChecked={tournament.deuceMethod === d} style={{ accentColor: "var(--green)" }} />
                                        <span style={{ fontSize: "0.84rem", color: "var(--label-2)" }}>{DEUCE_LABELS[d] || d}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {sectionLabel("Schedule")}
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
                                        <input type="radio" name="duration" value={d} defaultChecked={(tournament.duration || 90) === d} style={{ display: "none" }} id={`dur-${d}`} />
                                        <span style={{
                                            display: "inline-block", padding: "7px 12px", borderRadius: "var(--r-cell)",
                                            border: `2px solid ${(tournament.duration || 90) === d ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: (tournament.duration || 90) === d ? "var(--green)" : "var(--bg-grouped)",
                                            color: (tournament.duration || 90) === d ? "white" : "var(--label-2)",
                                            fontWeight: 700, fontSize: "0.85rem",
                                        }}>{d} min</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {sectionLabel("Entry Price")}
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

                    {sectionLabel("Location")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Venue Name</div>
                            <input name="location" defaultValue={tournament.location || ""}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>City / District</div>
                            <input name="city" defaultValue={tournament.city || ""}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Google Maps URL</div>
                            <input name="googleMapsUrl" defaultValue={tournament.googleMapsUrl || ""} type="url"
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.88rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }} />
                        </div>
                        <div style={{ padding: "13px 16px" }}>
                            <div style={{ fontSize: "0.62rem", color: "var(--label-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Country</div>
                            <select name="country" defaultValue={tournament.country || "OTHER"}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none", cursor: "pointer" }}>
                                {COUNTRIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {sectionLabel("Visibility")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
                        {[{ val: "true", label: "Public", desc: "Listed on The Clubhouse" }, { val: "false", label: "Private", desc: "Only via link/code" }].map((opt, i) => (
                            <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", borderBottom: i === 0 ? "1px solid var(--sep)" : "none" }}>
                                <input type="radio" name="isPublic" value={opt.val} defaultChecked={tournament.isPublic === (opt.val === "true")} style={{ accentColor: "var(--green)", width: 16, height: 16 }} />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>{opt.label}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--label-3)" }}>{opt.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 32, marginBottom: 40 }}>
                        <Link to={`/app/play/tournament/${tournament.id}/overview`} style={{ flex: 1, textDecoration: "none" }}>
                            <button type="button" style={{ width: "100%", padding: "14px", borderRadius: "var(--r-card)", background: "var(--bg-card)", border: "1px solid var(--sep)", color: "var(--label-2)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" }}>
                                Cancel
                            </button>
                        </Link>
                        <button type="submit" disabled={isSubmitting} style={{ flex: 2, padding: "14px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(28,79,53,0.3)" }}>
                            {isSubmitting ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </Form>

                {/* Player management */}
                {sectionLabel("Players")}
                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow)", marginBottom: 16 }}>
                    {tournament.players.map((p, i) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--sep)", gap: 12 }}>
                            <span style={{ flex: 1, fontSize: "0.92rem", color: "var(--label)", fontWeight: 500 }}>{p.name}</span>
                            <Form method="post">
                                <input type="hidden" name="intent" value="remove_player" />
                                <input type="hidden" name="playerId" value={p.id} />
                                <button type="submit" style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                    Remove
                                </button>
                            </Form>
                        </div>
                    ))}
                    <Form method="post" style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
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
            </div>
        </>
    );
}
```

- [ ] **Step 2: Add Edit Tournament button to overview page**

In `app/routes/app.play.tournament.$id.overview.jsx`, in the loader return add host check:
```js
const hostToken = await validateHostToken(request, tournament);
const isHost = Boolean(hostToken);
return json({ tournament, origin, isHost });
```

Add import: `import { validateHostToken } from "../utils/host-auth.server";`

In the component, after `const { tournament, origin } = useLoaderData();` add `isHost`:
```js
const { tournament, origin, isHost } = useLoaderData();
```

Add Edit button in the actions section (near the Share & QR / PDF buttons area):
```jsx
{isHost && tournament.status === "setup" && (
    <Link to={`/app/play/tournament/${tournament.id}/edit`} style={{ textDecoration: "none", flex: 1 }}>
        <button style={{ width: "100%", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--bg-card)", color: "var(--label)", border: "1px solid var(--sep)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow)" }}>
            Edit Tournament
        </button>
    </Link>
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.tournament.$id.edit.jsx app/routes/app.play.tournament.$id.overview.jsx
git commit -m "feat: host edit dashboard with full settings editing and email notifications"
```

---

## Task 12: Final Push

- [ ] **Step 1: Push all commits to Railway**

```bash
git push origin main
```

- [ ] **Step 2: Verify Railway deploy**

Check Railway dashboard — deploy should complete in ~2 minutes.

- [ ] **Step 3: Smoke test checklist**

- [ ] Visit `play.nopabrand.com/j/TESTCODE` — should redirect to Shopify join page
- [ ] Create a new tournament with duration set — WhatsApp text shows start + end time with emojis
- [ ] Join a tournament as a non-host — shows waiting view, player list, Cancel Registration button
- [ ] Cancel registration — confirmation dialog appears, on confirm redirects to join page
- [ ] Host visits `/app/play/tournament/ID/overview` — Edit Tournament button visible
- [ ] Host visits edit page — all fields editable, Save redirects to overview
- [ ] Generate button not visible to non-host

---

## Self-Review

**Spec coverage check:**
- ✅ WhatsApp emojis + end time — Task 3
- ✅ Duration field in creation — Task 4
- ✅ Short URL `/j/CODE` — Task 2
- ✅ Join page defaults to list + empty tile — Task 9
- ✅ Waitlist/standby with position — Tasks 5, 6
- ✅ Cancel registration both pages — Tasks 7, 8
- ✅ Standby promotion on cancel + email — Task 7
- ✅ Host-only generate button — Task 10
- ✅ Non-host waiting view + player list — Task 10
- ✅ Host edit dashboard — Task 11
- ✅ Location/price change emails — Tasks 5, 11
- ✅ Edit button on overview — Task 11
- ✅ DB migration — Task 1

**No gaps found.**
