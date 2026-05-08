# Live Scoring: Propose & Confirm Flow

**Date:** 2026-04-30
**Route:** `app.play.tournament.$id.jsx`

## Context

Players scan a QR code printed at the venue and land on the tournament view. The view is already host/non-host aware. This spec extends it with a propose-and-confirm scoring flow, auto-refresh, and host edit capability.

## Schema Change

One migration on `Match`:

```prisma
proposedScoreA  Int?
proposedScoreB  Int?
```

No new models. A match with proposed scores but no confirmed scores remains `status = "pending"`. Confirmed = `status = "completed"` with `scoreA/B` set.

## Actions

### `propose_score` (no auth)
- Anyone with the URL can call this.
- Allowed only when `match.status === "pending"` and `scoreA` is null.
- Writes `proposedScoreA` and `proposedScoreB`. Overwrites any existing proposal (last proposer wins — host confirmation is the trust layer).
- Validates: both values present, sum equals `pointsPerMatch`.

### `confirm_score` (host only)
- Copies `proposedScoreA/B` into `scoreA/B`, sets `status = "completed"`, clears proposed fields.
- Calls existing `submitScore` utility to update player points.

### `reset_score` (host only)
- Clears `scoreA`, `scoreB`, `proposedScoreA`, `proposedScoreB`, sets `status = "pending"`.
- Recalculates all player `totalPoints`, `matchesPlayed`, `matchesWon`, `matchesDrawn` from scratch using only the remaining completed matches in the tournament (excluding the match being reset). This is simpler and safer than tracking point deltas.
- Available on completed matches via an "Edit" button.

### `submit_score` (host only — unchanged)
- Host can still enter scores directly without going through proposal flow.

## Auto-refresh

In the component, a `useEffect` with `setInterval(30000)` calls `window.location.reload()` when `!isFinished`. Cleans up on unmount and when tournament finishes. No websockets needed.

## CourtCard UI

### Non-host states
1. **No proposal** — score inputs + "Propose Score" button. Same layout as host entry.
2. **Proposal pending** — proposed scores shown with muted "Awaiting confirmation" badge. Player can overwrite (resubmits `propose_score`).
3. **Completed** — large score display, same as current.

### Host states
1. **No proposal, pending** — existing direct score entry (unchanged).
2. **Proposal exists** — proposed score shown prominently + green "Confirm" button + smaller "Override" link that reveals input fields. Submitting the override calls the existing `submit_score` action directly, bypassing the proposal and immediately completing the match.
3. **Completed** — large score display + small "Edit" button that triggers `reset_score`, returning match to pending entry flow.

## Data Flow

```
Player → propose_score → proposedScoreA/B written
Host sees proposal → confirm_score → scoreA/B set, status=completed, points updated
Host made mistake → reset_score → all scores cleared, status=pending, points reversed
Host re-enters → submit_score or confirm new proposal → points updated again
```

## Constraints

- `propose_score` is intentionally unauthenticated. Host confirmation is the only trust gate.
- `reset_score` reverses points by subtracting what `submitScore` previously added, then recalculating from remaining completed matches.
- Auto-refresh only runs when tournament is not finished, preventing unnecessary reloads on the final leaderboard.
- The print PDF QR already links to the tournament view — no URL change needed.
