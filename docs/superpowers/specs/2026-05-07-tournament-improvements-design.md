# Tournament App Improvements — Design Spec
**Date:** 2026-05-07

---

## 1. WhatsApp Share Text

### Changes
- Add emojis: 🎾 (tournament), 🕰️ (time), 💸 (price), 📍 (location). No flag emojis (render as `?` on many Android clients).
- Add `duration` field (Int, minutes) to `Tournament` schema. Preset options: 60 / 90 / 120 / 150 / 180 min + custom input. Shown in Schedule section of creation form.
- End time calculated from `scheduledAt + duration`. Always shown as `🕰️ HH:MM - HH:MM`. If no duration set, show start time only.
- Join URL uses `play.nopabrand.com/j/CODE` (short redirect route `/j/:code` in Remix → redirects to Shopify join page).
- Google Maps URL shown as `📍 maps.app.goo.gl/...`

### Output format
```
🎾 "Tournament Name"
City · District
Day, DD/MM/YYYY
🕰️ 11:05 - 12:35
N player Game Type tournament
💸 Price XX CUR
📍 [google maps url]
Join code: CODE
play.nopabrand.com/j/CODE
```

### Files affected
- `app/utils/tournament-helpers.js` — `buildJoinInviteText()`
- `app/routes/app.play.tournament.new.jsx` — add duration field
- `app/routes/app.j.$code.jsx` — new short redirect route
- `prisma/schema.prisma` — add `duration Int?` to Tournament

---

## 2. Join Page & Waitlist

### Join page (step 2)
- Default tab: **Pick from list** (not "Enter my name")
- Player grid shows pre-registered players + one empty tile at bottom: `+ Add your name` with inline text input
- If no pre-registered players: show only the empty name tile

### Slot cap & waitlist
- Active slots capped at `tournament.maxPlayers`
- Once full, new signups go to **waitlist** (separate flow):
  - Stored in `TournamentParticipant` with `standbyPosition Int?` (1, 2, 3…)
  - No `Player` record created for waitlist entries
  - Waitlist player sees: "You're on standby — position X. You'll be emailed if a spot opens."
- When standby count hits 4: email host "4 players on standby for [tournament name]"

### Schema change
- `TournamentParticipant`: add `standbyPosition Int?` (null = active, 1+ = waitlist position)

### Files affected
- `prisma/schema.prisma`
- `app/routes/app.play.join.$code.jsx`
- `app/routes/api.public.tournaments.$id.signup.jsx` — waitlist logic
- `app/utils/email.server.js` — waitlist emails

---

## 3. Cancel Registration

### Button placement
- Both `/app/play/join/CODE` (after signup) and `/app/play/tournament/ID/player` pages
- Red "Cancel Registration" button
- Confirmation dialog: "Are you sure you want to deregister from this tournament?" with **Yes** / **No**

### On confirm
1. Delete `Player` record for this player
2. Delete `TournamentParticipant` record
3. If waitlist has entries: promote position 1
   - Create `Player` record for them
   - Update their `TournamentParticipant`: set `standbyPosition = null`, add `playerId`
   - Email them: "A spot opened — you're in! [tournament details]"
   - Shift remaining waitlist positions down by 1
4. Redirect deregistered player to join page with message "You've been removed from [tournament]"

### Files affected
- `app/routes/app.play.join.$code.jsx`
- `app/routes/app.play.tournament.$id.player.jsx`
- New action: `app/routes/api.tournament.$id.deregister.jsx`
- `app/utils/email.server.js`

---

## 4. Round Generation — Host Only

### Generate button
- Only rendered when `isHost = true`
- Disabled (with explanation) if player count < minimum for game type
- Non-hosts never see it

### Non-host waiting view (before generation)
- Message: "Waiting for the host to start the tournament"
- Player list (read-only, shows who has signed up)
- Red "Cancel Registration" button at bottom

### After generation
- Non-hosts switch to normal scoring/leaderboard view (no change to existing flow)

### Files affected
- `app/routes/app.play.tournament.$id.jsx`

---

## 5. Host Edit Dashboard

### Route
`/app/play/tournament/ID/edit` — host-only (403 if no host cookie)

### Access
- "Edit Tournament" button on overview page, only shown while `tournament.status = "setup"`
- After rounds generated: edit button hidden, settings locked

### Editable fields
- Game type
- Player names (add / remove / rename)
- Date, time, duration
- Courts (number + names)
- Points per match
- Deuce method
- Max players
- Price + currency
- Location + Google Maps URL
- Visibility (public/private)

### Save behaviour
- Single "Save Changes" button
- If **location changed** → email all `TournamentParticipant` records: "The venue for [name] has been updated to [new location]. [Maps link]"
- If **price changed** → email all participants: "The entry price for [name] has been updated to [price] [currency]"
- All other changes: silent save

### UI
- Distinct HOST DASHBOARD header strip (dark green, clearly labelled)
- "Cancel" returns to overview without saving
- Same section/card layout as creation form for consistency

### Files affected
- New: `app/routes/app.play.tournament.$id.edit.jsx`
- `app/utils/email.server.js` — location/price change emails
- `app/routes/app.play.tournament.$id.overview.jsx` — add Edit button

---

## 6. Custom Domain

### Setup (manual, user action)
- `play.nopabrand.com` → Railway via CNAME (already configured in DNS)
- Railway: custom domain `play.nopabrand.com` added to service

### Short redirect route
- `app/routes/app.j.$code.jsx` — loader redirects to `https://nopabrand.com/pages/organise-americano?join=CODE`
- Used in WhatsApp share text

---

## Migration

One new migration:
```prisma
// Tournament
duration  Int?   // minutes, host-set

// TournamentParticipant  
standbyPosition  Int?  // null=active, 1+=waitlist order
```
