# Design: Join Board Fixes, Share Page, Email Fix

Date: 2026-05-14  
Status: Approved

---

## Section 1 — Shopify Liquid Fixes (re-paste)

Five changes to `shopify-custom-tournaments.liquid`, all in `cardUp()` rendering:

### 1.1 Logo on card
- Render a 32×32 rounded image in the card header top-right if `t.logoUrl` is set
- Positioned next to the OPEN/FULL/Waitlist badge
- Hidden if no logo

### 1.2 Spots language
- Left side of bar row: `"X spots left"` instead of `"X signed up"`
- Right side: `"waitlist open"` if waitlist count > 0, otherwise nothing
- When full with no waitlist: `"Full"`

### 1.3 Bar fill
- Already correct in new liquid code — this is an old-liquid-in-Shopify issue
- Re-pasting the current liquid file into Shopify admin fixes it

### 1.4 Level dots
- Already in new liquid code — same fix as 1.3, re-paste resolves it

### 1.5 Host password visual
- No code change needed for master password (works correctly)
- Custom password fix covered in Section 2

---

## Section 2 — Host Password Bug (custom password)

### Problem
The custom password set during tournament creation doesn't authenticate via the HOST button. The master password `NOPAMAIKELKEVIN1@` works correctly.

### Root cause investigation
The organiser section of `app.play.tournament.new.jsx` contains the `hostPassword` input. The likely cause is one of:
- Input missing `name="hostPassword"` attribute, so Remix doesn't pick it up on submit
- Input is controlled (uses React state) but has no `onChange`, causing value not to be submitted
- Value is being trimmed or transformed differently than what's stored

### Fix
Audit the `hostPassword` input in the organiser section. Ensure it is:
```jsx
<input
  name="hostPassword"
  type="password"
  value={hostPassword}
  onChange={(e) => setHostPassword(e.target.value)}
/>
```
Confirm `hostPassword` state is wired through to `prisma.tournament.create`. No API changes needed — `host-auth.jsx` comparison logic is correct.

---

## Section 3 — Share Page (`play.nopabrand.com/j/CODE`)

### Current behaviour
`j.$code.jsx` does a server-side redirect to `nopabrand.com/pages/organise-americano?join=CODE`, which opens a small modal on the Shopify page.

### New behaviour
`j.$code.jsx` becomes a full server-rendered Remix page (no redirect). It fetches tournament data from the public API and renders a mobile-optimised landing page.

### Layout (mobile-first)
```
┌─────────────────────────────┐
│  [dark green bento card]    │
│  name, venue, date/time     │
│  duration, entry, level     │
│  description strip          │
│  spots bar                  │
└─────────────────────────────┘
┌─────────────────────────────┐
│  Players (X / Y)            │
│  1. Jan de Vries            │
│  2. Sarah Smith             │
│  3. — open slot —           │
│  4. — open slot —           │
│  [waitlist: 2 on waitlist]  │
└─────────────────────────────┘
         ↕ scroll
┌─────────────────────────────┐  ← sticky bottom
│    🎾  Join Tournament      │
└─────────────────────────────┘
```

### Data
- Loader fetches `GET /api/public/tournaments` and finds tournament by `joinCode`
- Falls back to 404 page if code not found or tournament is past
- Player names filtered (no emails shown) — same `cleanNames()` logic as liquid
- Open slots = `maxPlayers - playerCount` rendered as `— open slot —` rows
- Waitlist shown as a count label below the player list if `standbyCount > 0`

### Join button
- Sticky at bottom: `"🎾 Join Tournament"`
- Links to `https://nopabrand.com/pages/organise-americano?join=CODE`
- If tournament is full and has waitlist slots: `"Join Waitlist"` (orange)
- If tournament is full with no waitlist: button disabled, text `"Tournament Full"`

### No nav chrome
- No top nav bar
- NOPA logo/wordmark centered at top as minimal header
- Dark green card style consistent with bento

---

## Section 4 — Email Position Count Fix

### File
`app/routes/api.public.tournaments.$id.signup.jsx`

### Problem
The confirmation email says "You're in — spot X of Y". X is calculated as `currentCount + 1` where `currentCount` only counts public `TournamentParticipant` records. Host-preset `Player` records (added during creation) are not included, so the first public registrant always gets position 1 even if the host added 5 players.

### Fix
```js
// Before
const position = currentCount + 1;

// After
const position = tournament.players.length + currentCount + 1;
```

`tournament.players` = preset players added by host at creation time.  
`currentCount` = active public participants already signed up.  
Together they give the true total number of people already in the tournament before this registrant.

---

## Files Changed

| File | Change |
|------|--------|
| `shopify-custom-tournaments.liquid` | Logo on card, spots language, re-paste fixes level+bar |
| `app/routes/j.$code.jsx` | Full share page instead of redirect |
| `app/routes/app.play.tournament.new.jsx` | Audit + fix hostPassword input wiring |
| `app/routes/api.public.tournaments.$id.signup.jsx` | Position count fix |
