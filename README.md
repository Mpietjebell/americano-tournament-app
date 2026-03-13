# NOPA Padel Tournament App

NOPA is a Remix tournament management app for running padel formats such as Americano, Mexicano, Mixicano, Team Americano, and Beat the Box. It includes a host match manager, player join flow, live scoreboard, results sharing, and print-friendly schedules.

## Stack

- Remix with React Router v2 style file routes
- Prisma with SQLite at `prisma/dev.sqlite`
- Cookie-based auth for hosts and players
- Custom iOS-inspired design system in `app/styles/nopa-theme.css`
- Shopify CLI for local development and deployment

## Key Routes

- `app/routes/app.play._index.jsx`: Clubhouse home
- `app/routes/app.play.tournament.new.jsx`: tournament creation
- `app/routes/app.play.tournament.$id.jsx`: host match manager
- `app/routes/app.play.tournament.$id.player.jsx`: player live scoreboard
- `app/routes/app.play.tournament.$id.final.jsx`: final results
- `app/routes/app.play.tournament.$id.overview.jsx`: post-create overview
- `app/routes/app.play.tournament.$id.share.jsx`: invite and QR sharing
- `app/routes/app.play.tournament.$id.print.jsx`: print layout
- `app/routes/app.play.join._index.jsx`: join by code
- `app/routes/app.play.join.$code.jsx`: player selection and email capture

## Core Server Files

- `app/db.server.js`: Prisma client
- `app/utils/tournament-actions.server.js`: tournament loading, round generation, and score submission
- `app/utils/tournament-engine.server.js`: pairing algorithms and score processing
- `prisma/schema.prisma`: tournament, player, round, match, and participant models

## Development

Install dependencies:

```sh
npm install
```

Start the app:

```sh
npm run dev
```

This uses `shopify app dev` and serves the app locally, typically on `http://localhost:3000`.

## Database

Generate Prisma client and apply schema changes:

```sh
npm run prisma generate
npm run prisma db push
```

The local database file is `prisma/dev.sqlite`.

## GitHub And Railway

This app can be pushed to GitHub and deployed on Railway on a separate app URL so it does not interfere with the main Shopify storefront.

### 1. Create a GitHub repository

In GitHub:

1. Create a new empty repository
2. Do not add a README, `.gitignore`, or license in GitHub
3. Copy the repository URL

In this project folder run:

```sh
git add .
git commit -m "Initial NOPA app"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### 2. Create a Railway project

In Railway:

1. Create a new project from the GitHub repository
2. Railway will detect the `Dockerfile`
3. Add these environment variables from your real app credentials:

```sh
DATABASE_URL=file:/data/dev.sqlite
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=...
SHOPIFY_APP_URL=https://play.nopabrand.com
```

### 3. Attach persistent storage in Railway

If you stay on SQLite, Railway must mount a persistent volume at `/data`. Without that, the database will reset on deploy.

### 4. Point only the app subdomain at Railway

Use a separate subdomain such as `play.nopabrand.com`.

Only add one DNS record:

- Type: `CNAME`
- Host: `play`
- Target: the Railway domain Railway gives you

This leaves the main website, webshop, email, analytics, SSL, and verification records unchanged.

### 5. Update Shopify app config

Before a real deploy, update:

- `shopify.app.toml`
  - `application_url`
  - `[auth].redirect_urls`

to match the live app domain.

## Assets

Public images live in `public/`, including:

- `hero-court.png`
- `player-portal.png`
- `format-americano.png`
- `format-knockout.png`

## AI Image Generation

Image generation helpers live in `../antigravity-kie-mcp/` relative to this app.

- `generate-image.js`: generates images through Kie.ai
- model: `google/nano-banana`
- API key source: `../.env` via `KIE_API_KEY`

## Design Notes

- Brand green: `#1C4F35`
- Background: `#F2EDE4`
- Headings: Cormorant Garamond
- UI text: Inter
- Public pages should use the NOPA iOS navigation, rounded cards, and inline button styling
- Avoid emoji as structural UI icons
