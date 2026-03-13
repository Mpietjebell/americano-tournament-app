# AI Tools

Two AI tools are available to the agent in this project.

---

## 1. UI/UX Pro Max — Design Intelligence

A searchable database of 67 styles, 96 palettes, 57 font pairings, 99 UX guidelines, and 25 chart types.

### Usage

```bash
# Full design system (start here)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "padel sports app green minimal" --design-system -p "NOPA Padel"

# Domain searches
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "sports tournament" --domain style
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "green brand" --domain color
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "leaderboard table" --domain ux
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "modern sans-serif" --domain typography
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "real-time scores" --domain chart

# Stack-specific (React)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "performance lists" --stack react

# Persist design system across sessions
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "padel sports" --design-system --persist -p "NOPA"
# → creates design-system/MASTER.md
```

**Available domains:** `product` · `style` · `color` · `typography` · `landing` · `chart` · `ux` · `react` · `web` · `prompt`

The agent uses this skill automatically when working on any UI task.

---

## 2. Kie.ai Nano Banana — Image Generation

Generates images from text prompts using the `google/nano-banana` model.

### Setup

Add your API key to `.env`:
```
KIE_API_KEY=your_key_here
```

### Usage from agent (TypeScript)

```typescript
import { generateImage, generateHeroImage } from "../services/nano-banana";

// Generate any image
const filePath = await generateImage("minimal luxury padel homepage hero, white background, green accents");

// Convenience hero helper
const heroPath = await generateHeroImage("NOPA Padel tournament leaderboard screen, dark green, clean UI");
```

### Output

Generated images are saved to `generated-images/` with timestamped filenames:
```
generated-images/
  2026-03-11T10-30-00-minimal-luxury-padel-homepage-hero.png
```

### Run directly (Node)

```bash
KIE_API_KEY=your_key npx tsx services/nano-banana.ts
```

### What it does internally

1. `POST /api/v1/jobs/createTask` — starts the job (model: `google/nano-banana`, format: `png`, size: `16:9`)
2. Polls `GET /api/v1/jobs/recordInfo?taskId=...` every 3 seconds until `state === "success"`
3. Downloads the result image to `generated-images/`
4. Returns the local file path

Error handling: retries failed poll requests, throws after 2 minutes (40 attempts × 3s).

---

## Example combined workflow

```bash
# 1. Get design system recommendations
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "padel sports app minimal green" --design-system -p "NOPA"

# 2. Generate a hero image matching those recommendations
# (in agent code)
await generateHeroImage("minimal luxury padel hero, #1C4F35 green, white card, tournament bracket")
```
