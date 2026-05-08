# Live Scoring: Propose & Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player score proposals, host confirmation, host score reset, and 30-second auto-refresh to the tournament live view.

**Architecture:** Extend the existing `app.play.tournament.$id.jsx` route with three new server actions (`propose_score`, `confirm_score`, `reset_score`) and update the `CourtCard` component to render different UI based on `isHost` and match state. Auto-refresh uses `setInterval` + `window.location.reload()`.

**Tech Stack:** Remix (React + server actions), Prisma + SQLite, no new dependencies.

---

## File Map

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `proposedScoreA Int?` and `proposedScoreB Int?` to `Match` |
| `prisma/migrations/20260430000000_add_proposed_scores/migration.sql` | New migration SQL |
| `app/utils/tournament-actions.server.js` | Add `proposeScore`, `confirmScore`, `resetScore` exports |
| `app/routes/app.play.tournament.$id.jsx` | Wire 3 new actions, add auto-refresh `useEffect`, update `CourtCard` UI |

---

### Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260430000000_add_proposed_scores/migration.sql`

- [ ] **Step 1: Add fields to schema**

In `prisma/schema.prisma`, find the `Match` model and add two nullable Int fields after `scoreB`:

```prisma
model Match {
  id       String @id @default(uuid())
  court    Int
  teamAIds String
  teamBIds String
  scoreA   Int?
  scoreB   Int?
  proposedScoreA Int?
  proposedScoreB Int?
  status   String @default("pending")
  roundId  String
  round    Round  @relation(fields: [roundId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Create migration file**

Create `prisma/migrations/20260430000000_add_proposed_scores/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Match" ADD COLUMN "proposedScoreA" INTEGER;
ALTER TABLE "Match" ADD COLUMN "proposedScoreB" INTEGER;
```

- [ ] **Step 3: Apply migration**

```bash
cd organise-americano && npx prisma migrate deploy
```

Expected: `1 migration applied.`

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260430000000_add_proposed_scores/migration.sql
git commit -m "feat: add proposedScoreA/B to Match schema"
```

---

### Task 2: Server action — proposeScore

**Files:**
- Modify: `app/utils/tournament-actions.server.js`

- [ ] **Step 1: Add proposeScore export**

Append to the end of `app/utils/tournament-actions.server.js`:

```js
export async function proposeScore(tournament, matchId, scoreA, scoreB) {
    if (isNaN(scoreA) || isNaN(scoreB)) return { error: "Please enter valid scores." };
    if (scoreA + scoreB !== tournament.pointsPerMatch) {
        return { error: `Scores must add up to ${tournament.pointsPerMatch}.` };
    }

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return { error: "Match not found." };
    if (match.status === "completed") return { error: "This match is already completed." };

    await prisma.match.update({
        where: { id: matchId },
        data: { proposedScoreA: scoreA, proposedScoreB: scoreB },
    });

    return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/tournament-actions.server.js
git commit -m "feat: add proposeScore server action"
```

---

### Task 3: Server action — confirmScore

**Files:**
- Modify: `app/utils/tournament-actions.server.js`

- [ ] **Step 1: Add confirmScore export**

Append to the end of `app/utils/tournament-actions.server.js`:

```js
export async function confirmScore(tournament, matchId) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return { error: "Match not found." };
    if (match.proposedScoreA == null || match.proposedScoreB == null) {
        return { error: "No proposed score to confirm." };
    }

    const result = await submitScore(tournament, matchId, match.proposedScoreA, match.proposedScoreB);
    if (result.error) return result;

    await prisma.match.update({
        where: { id: matchId },
        data: { proposedScoreA: null, proposedScoreB: null },
    });

    return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/tournament-actions.server.js
git commit -m "feat: add confirmScore server action"
```

---

### Task 4: Server action — resetScore

**Files:**
- Modify: `app/utils/tournament-actions.server.js`

- [ ] **Step 1: Add resetScore export**

Append to the end of `app/utils/tournament-actions.server.js`:

```js
export async function resetScore(tournament, matchId) {
    await prisma.match.update({
        where: { id: matchId },
        data: {
            scoreA: null,
            scoreB: null,
            proposedScoreA: null,
            proposedScoreB: null,
            status: "pending",
        },
    });

    const matchRound = await prisma.round.findFirst({
        where: { matches: { some: { id: matchId } } },
        include: { matches: true },
    });
    if (matchRound && matchRound.status === "completed") {
        await prisma.round.update({
            where: { id: matchRound.id },
            data: { status: "active" },
        });
    }

    const allRounds = await prisma.round.findMany({
        where: { tournamentId: tournament.id },
        include: { matches: true },
    });

    const players = await prisma.player.findMany({
        where: { tournamentId: tournament.id },
    });

    const playerMap = new Map(players.map((p) => [p.id, {
        id: p.id,
        totalPoints: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesDrawn: 0,
    }]));

    for (const round of allRounds) {
        for (const match of round.matches) {
            if (match.id === matchId) continue;
            if (match.status !== "completed" || match.scoreA == null || match.scoreB == null) continue;
            const teamAIds = JSON.parse(match.teamAIds);
            const teamBIds = JSON.parse(match.teamBIds);
            const isDraw = match.scoreA === match.scoreB;
            for (const playerId of teamAIds) {
                const p = playerMap.get(playerId);
                if (!p) continue;
                p.totalPoints += match.scoreA;
                p.matchesPlayed += 1;
                if (match.scoreA > match.scoreB) p.matchesWon += 1;
                if (isDraw) p.matchesDrawn += 1;
            }
            for (const playerId of teamBIds) {
                const p = playerMap.get(playerId);
                if (!p) continue;
                p.totalPoints += match.scoreB;
                p.matchesPlayed += 1;
                if (match.scoreB > match.scoreA) p.matchesWon += 1;
                if (isDraw) p.matchesDrawn += 1;
            }
        }
    }

    for (const stats of playerMap.values()) {
        await prisma.player.update({
            where: { id: stats.id },
            data: {
                totalPoints: stats.totalPoints,
                matchesPlayed: stats.matchesPlayed,
                matchesWon: stats.matchesWon,
                matchesDrawn: stats.matchesDrawn,
            },
        });
    }

    const updatedRounds = await prisma.round.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { roundNumber: "asc" },
        include: { matches: true },
    });

    const firstIncomplete = updatedRounds.find((r) => r.status !== "completed");
    if (firstIncomplete) {
        await prisma.tournament.update({
            where: { id: tournament.id },
            data: { currentRound: firstIncomplete.roundNumber, status: "active" },
        });
    }

    return { success: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/tournament-actions.server.js
git commit -m "feat: add resetScore server action"
```

---

### Task 5: Wire new actions into the route

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Add imports at top of route file**

Find the existing import line:

```js
import { loadTournament, generateAllRounds, submitScore } from "../utils/tournament-actions.server";
```

Replace with:

```js
import { loadTournament, generateAllRounds, submitScore, proposeScore, confirmScore, resetScore } from "../utils/tournament-actions.server";
```

- [ ] **Step 2: Add three new intent handlers in the action function**

Find this block in the `action` function:

```js
    if (intent === "submit_score") {
```

Add the following three blocks immediately after the closing `}` of the `submit_score` block (before the final `return json({ error: "Unknown action" }`):

```js
    if (intent === "propose_score") {
        const matchId = formData.get("matchId");
        const scoreA = parseInt(formData.get("scoreA"), 10);
        const scoreB = parseInt(formData.get("scoreB"), 10);
        const result = await proposeScore(tournament, matchId, scoreA, scoreB);
        if (result.error) return json({ error: result.error }, { status: 400 });
        return json({ success: true });
    }

    if (intent === "confirm_score") {
        if (!isHost) return json({ error: "Host access required." }, { status: 403 });
        const matchId = formData.get("matchId");
        const result = await confirmScore(tournament, matchId);
        if (result.error) return json({ error: result.error }, { status: 400 });
        return json({ success: true });
    }

    if (intent === "reset_score") {
        if (!isHost) return json({ error: "Host access required." }, { status: 403 });
        const matchId = formData.get("matchId");
        const result = await resetScore(tournament, matchId);
        if (result.error) return json({ error: result.error }, { status: 400 });
        return json({ success: true });
    }
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.tournament.\$id.jsx
git commit -m "feat: wire propose_score, confirm_score, reset_score actions"
```

---

### Task 6: Auto-refresh

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Add auto-refresh useEffect**

In the `PublicTournamentView` component, find the existing `useEffect` block:

```js
    useEffect(() => {
        if (isFinished && activeTab === "courts") {
            const timer = setTimeout(() => setActiveTab("leaderboard"), 500);
            return () => clearTimeout(timer);
        }
    }, [activeTab, isFinished]);
```

Add a new `useEffect` immediately after it:

```js
    useEffect(() => {
        if (isFinished) return;
        const interval = setInterval(() => {
            window.location.reload();
        }, 30000);
        return () => clearInterval(interval);
    }, [isFinished]);
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/app.play.tournament.\$id.jsx
git commit -m "feat: add 30s auto-refresh for active tournaments"
```

---

### Task 7: CourtCard — non-host proposal UI

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Replace the non-host pending section in CourtCard**

Find this block inside the `CourtCard` function (the non-host pending state):

```js
                ) : (
                    <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
                        <div style={{ fontSize: "0.76rem", color: "var(--label-3)" }}>Score entry available to host only</div>
                    </div>
                )}
```

Replace it with:

```js
                ) : (
                    <PlayerProposalForm
                        match={match}
                        pointsPerMatch={pointsPerMatch}
                        fetcher={fetcher}
                    />
                )}
```

- [ ] **Step 2: Add PlayerProposalForm component**

Add this new component function immediately before the `CourtCard` function definition:

```js
function PlayerProposalForm({ match, pointsPerMatch, fetcher }) {
    const hasProposal = match.proposedScoreA != null && match.proposedScoreB != null;
    const [scoreA, setScoreA] = useState(hasProposal ? String(match.proposedScoreA) : "");
    const [scoreB, setScoreB] = useState(hasProposal ? String(match.proposedScoreB) : "");
    const [showEdit, setShowEdit] = useState(false);

    const handleScoreAChange = (e) => {
        const val = e.target.value;
        setScoreA(val);
        if (val !== "" && !isNaN(parseInt(val, 10))) {
            const a = parseInt(val, 10);
            if (a >= 0 && a <= pointsPerMatch) setScoreB(String(pointsPerMatch - a));
        } else { setScoreB(""); }
    };

    const handleScoreBChange = (e) => {
        const val = e.target.value;
        setScoreB(val);
        if (val !== "" && !isNaN(parseInt(val, 10))) {
            const b = parseInt(val, 10);
            if (b >= 0 && b <= pointsPerMatch) setScoreA(String(pointsPerMatch - b));
        } else { setScoreA(""); }
    };

    const totalValid = scoreA !== "" && scoreB !== "" && parseInt(scoreA) + parseInt(scoreB) === pointsPerMatch;

    if (hasProposal && !showEdit) {
        return (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--label-2)" }}>{match.proposedScoreA}</span>
                    <span style={{ color: "var(--label-4)", fontWeight: 700 }}>—</span>
                    <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--label-2)" }}>{match.proposedScoreB}</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "#8B7340", fontWeight: 600, background: "rgba(197,165,90,0.1)", border: "1px solid rgba(197,165,90,0.25)", borderRadius: "var(--r-pill)", padding: "4px 12px", display: "inline-block", marginBottom: 8 }}>
                    Awaiting host confirmation
                </div>
                <div>
                    <button
                        type="button"
                        onClick={() => setShowEdit(true)}
                        style={{ fontSize: "0.72rem", color: "var(--label-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
                    >
                        Edit proposal
                    </button>
                </div>
            </div>
        );
    }

    return (
        <fetcher.Form method="post">
            <input type="hidden" name="intent" value="propose_score" />
            <input type="hidden" name="matchId" value={match.id} />
            <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.7rem", color: "var(--label-3)" }}>
                Total = {pointsPerMatch} pts
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                <input
                    type="number" name="scoreA" min="0" max={pointsPerMatch}
                    value={scoreA} onChange={handleScoreAChange} placeholder="0"
                    style={{
                        width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                        border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                        background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                    }}
                />
                <span style={{ color: "var(--label-3)", fontWeight: 700, fontSize: "1.2rem" }}>—</span>
                <input
                    type="number" name="scoreB" min="0" max={pointsPerMatch}
                    value={scoreB} onChange={handleScoreBChange} placeholder="0"
                    style={{
                        width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                        border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                        background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                    }}
                />
            </div>
            <button
                type="submit"
                disabled={fetcher.state !== "idle" || !totalValid}
                style={{
                    width: "100%", padding: "11px", borderRadius: "var(--r-cell)",
                    background: totalValid ? "rgba(28,79,53,0.12)" : "var(--sep-opaque)",
                    color: totalValid ? "var(--green)" : "var(--label-3)",
                    fontWeight: 600, fontSize: "0.9rem", border: totalValid ? "1.5px solid rgba(28,79,53,0.2)" : "none",
                    cursor: totalValid ? "pointer" : "not-allowed", fontFamily: "inherit",
                    transition: "background 0.2s",
                }}
            >
                {fetcher.state !== "idle" ? "Submitting..." : hasProposal ? "Update Proposal" : "Propose Score"}
            </button>
        </fetcher.Form>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.tournament.\$id.jsx
git commit -m "feat: add player score proposal UI to CourtCard"
```

---

### Task 8: CourtCard — host confirmation UI

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Update the host pending section in CourtCard**

Find this block inside `CourtCard` (the host pending state):

```js
                ) : isHost ? (
                    <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="submit_score" />
                        <input type="hidden" name="matchId" value={match.id} />
                        <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.7rem", color: "var(--label-3)" }}>
                            Total = {pointsPerMatch} pts
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                            <input
                                type="number" name="scoreA" min="0" max={pointsPerMatch}
                                value={scoreA} onChange={handleScoreAChange} placeholder="0"
                                style={{
                                    width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                                    border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                    background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                                }}
                            />
                            <span style={{ color: "var(--label-3)", fontWeight: 700, fontSize: "1.2rem" }}>—</span>
                            <input
                                type="number" name="scoreB" min="0" max={pointsPerMatch}
                                value={scoreB} onChange={handleScoreBChange} placeholder="0"
                                style={{
                                    width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                                    border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                    background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                                }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={fetcher.state !== "idle" || !totalValid}
                            style={{
                                width: "100%", padding: "11px", borderRadius: "var(--r-cell)",
                                background: totalValid ? "var(--green)" : "var(--sep-opaque)",
                                color: "white", fontWeight: 600, fontSize: "0.9rem", border: "none",
                                cursor: totalValid ? "pointer" : "not-allowed", fontFamily: "inherit",
                                transition: "background 0.2s",
                            }}
                        >
                            Submit Score
                        </button>
                    </fetcher.Form>
```

Replace it with:

```js
                ) : isHost ? (
                    <HostScoreEntry
                        match={match}
                        pointsPerMatch={pointsPerMatch}
                        fetcher={fetcher}
                        scoreA={scoreA}
                        scoreB={scoreB}
                        setScoreA={setScoreA}
                        setScoreB={setScoreB}
                        handleScoreAChange={handleScoreAChange}
                        handleScoreBChange={handleScoreBChange}
                        totalValid={totalValid}
                    />
```

- [ ] **Step 2: Add HostScoreEntry component**

Add immediately before the `PlayerProposalForm` function definition:

```js
function HostScoreEntry({ match, pointsPerMatch, fetcher, scoreA, scoreB, setScoreA, setScoreB, handleScoreAChange, handleScoreBChange, totalValid }) {
    const hasProposal = match.proposedScoreA != null && match.proposedScoreB != null;
    const [showOverride, setShowOverride] = useState(false);

    if (hasProposal && !showOverride) {
        return (
            <div>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: "0.65rem", color: "#8B7340", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                        Player proposal
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 10 }}>
                        <span style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--label)" }}>{match.proposedScoreA}</span>
                        <span style={{ color: "var(--label-4)", fontWeight: 700 }}>—</span>
                        <span style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--label)" }}>{match.proposedScoreB}</span>
                    </div>
                    <fetcher.Form method="post" style={{ marginBottom: 8 }}>
                        <input type="hidden" name="intent" value="confirm_score" />
                        <input type="hidden" name="matchId" value={match.id} />
                        <button
                            type="submit"
                            disabled={fetcher.state !== "idle"}
                            style={{
                                width: "100%", padding: "11px", borderRadius: "var(--r-cell)",
                                background: "var(--green)", color: "white",
                                fontWeight: 700, fontSize: "0.95rem", border: "none",
                                cursor: "pointer", fontFamily: "inherit",
                                boxShadow: "0 2px 12px rgba(28,79,53,0.25)",
                            }}
                        >
                            {fetcher.state !== "idle" ? "Confirming..." : "Confirm Score"}
                        </button>
                    </fetcher.Form>
                    <button
                        type="button"
                        onClick={() => setShowOverride(true)}
                        style={{ fontSize: "0.72rem", color: "var(--label-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
                    >
                        Override with different score
                    </button>
                </div>
            </div>
        );
    }

    return (
        <fetcher.Form method="post">
            <input type="hidden" name="intent" value="submit_score" />
            <input type="hidden" name="matchId" value={match.id} />
            <div style={{ textAlign: "center", marginBottom: 8, fontSize: "0.7rem", color: "var(--label-3)" }}>
                Total = {pointsPerMatch} pts
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 12 }}>
                <input
                    type="number" name="scoreA" min="0" max={pointsPerMatch}
                    value={scoreA} onChange={handleScoreAChange} placeholder="0"
                    style={{
                        width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                        border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                        background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                    }}
                />
                <span style={{ color: "var(--label-3)", fontWeight: 700, fontSize: "1.2rem" }}>—</span>
                <input
                    type="number" name="scoreB" min="0" max={pointsPerMatch}
                    value={scoreB} onChange={handleScoreBChange} placeholder="0"
                    style={{
                        width: 60, height: 52, textAlign: "center", fontSize: "1.4rem", fontWeight: 700,
                        border: "2px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                        background: "var(--bg-grouped)", color: "var(--label)", fontFamily: "inherit", outline: "none",
                    }}
                />
            </div>
            <button
                type="submit"
                disabled={fetcher.state !== "idle" || !totalValid}
                style={{
                    width: "100%", padding: "11px", borderRadius: "var(--r-cell)",
                    background: totalValid ? "var(--green)" : "var(--sep-opaque)",
                    color: "white", fontWeight: 600, fontSize: "0.9rem", border: "none",
                    cursor: totalValid ? "pointer" : "not-allowed", fontFamily: "inherit",
                    transition: "background 0.2s",
                }}
            >
                {fetcher.state !== "idle" ? "Submitting..." : "Submit Score"}
            </button>
            {showOverride && (
                <button
                    type="button"
                    onClick={() => setShowOverride(false)}
                    style={{ width: "100%", marginTop: 6, fontSize: "0.72rem", color: "var(--label-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
                >
                    Cancel override
                </button>
            )}
        </fetcher.Form>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.play.tournament.\$id.jsx
git commit -m "feat: add host confirm/override UI to CourtCard"
```

---

### Task 9: CourtCard — host edit on completed matches

**Files:**
- Modify: `app/routes/app.play.tournament.$id.jsx`

- [ ] **Step 1: Add Edit button to completed score display in CourtCard**

Find this block inside `CourtCard` (the completed state):

```js
                {isCompleted ? (
                    <div style={{ textAlign: "center", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreA}</span>
                            <span style={{ color: "var(--label-4)", fontWeight: 700 }}>—</span>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreB}</span>
                        </div>
                        {match.scoreA === match.scoreB && (
                            <div style={{ fontSize: "0.7rem", color: "#8B7340", fontWeight: 600, marginTop: 4 }}>Draw</div>
                        )}
                    </div>
```

Replace with:

```js
                {isCompleted ? (
                    <div style={{ textAlign: "center", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreA}</span>
                            <span style={{ color: "var(--label-4)", fontWeight: 700 }}>—</span>
                            <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--green)" }}>{match.scoreB}</span>
                        </div>
                        {match.scoreA === match.scoreB && (
                            <div style={{ fontSize: "0.7rem", color: "#8B7340", fontWeight: 600, marginTop: 4 }}>Draw</div>
                        )}
                        {isHost && (
                            <fetcher.Form method="post" style={{ marginTop: 8 }}>
                                <input type="hidden" name="intent" value="reset_score" />
                                <input type="hidden" name="matchId" value={match.id} />
                                <button
                                    type="submit"
                                    disabled={fetcher.state !== "idle"}
                                    style={{
                                        fontSize: "0.68rem", color: "var(--label-3)", background: "none",
                                        border: "none", cursor: "pointer", textDecoration: "underline",
                                        fontFamily: "inherit", padding: 0,
                                    }}
                                >
                                    Edit score
                                </button>
                            </fetcher.Form>
                        )}
                    </div>
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/app.play.tournament.\$id.jsx
git commit -m "feat: add host edit button to reset completed match scores"
```

---

### Task 10: Smoke test

- [ ] **Step 1: Start dev server**

```bash
cd organise-americano && npm run dev
```

- [ ] **Step 2: Test player proposal flow**
  1. Open a tournament with an active round in a non-host browser tab (no `?hostToken` cookie)
  2. Find a pending CourtCard — score inputs should be visible with "Propose Score" button
  3. Enter a valid score (e.g. 15–6 for 21-point match) → button enables
  4. Submit → card shows proposed score + "Awaiting host confirmation" badge

- [ ] **Step 3: Test host confirmation flow**
  1. In the host browser tab, reload — pending CourtCard should show the proposed score + green "Confirm Score" button
  2. Click Confirm → card flips to completed with final score
  3. Leaderboard updates with correct points

- [ ] **Step 4: Test host override**
  1. With a proposal pending, click "Override with different score"
  2. Direct entry form appears — submit a different score
  3. Match completes with the overridden score (not the proposal)

- [ ] **Step 5: Test host edit**
  1. On a completed match, click "Edit score"
  2. Match resets to pending — score inputs reappear
  3. Leaderboard points recalculate correctly (player who had those points loses them)

- [ ] **Step 6: Test auto-refresh**
  1. Open tournament in a non-host tab
  2. Wait 30 seconds — page reloads automatically
  3. After tournament finishes, confirm reloads stop

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: live scoring propose/confirm flow complete"
```
