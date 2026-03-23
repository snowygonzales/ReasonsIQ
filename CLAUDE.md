# InferenceIQ

LLM cost intelligence platform — aggregates API pricing, GPU compute costs, and quality benchmarks into a single decision-support dashboard.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API routes (same repo)
- **Database**: SQLite (via better-sqlite3) for MVP, migrate to PostgreSQL later
- **Scheduling**: node-cron for data pipeline polling
- **Deployment**: Vercel (frontend) + Hetzner VPS (API/DB)

## Data Sources

- **OpenRouter API** (`/api/v1/models`) — LLM API pricing, 300+ models, free, no auth
- **Vast.ai API** (`/api/v0/bundles/`) — GPU marketplace offers, real-time pricing

## Project Conventions

- Keep it simple. MVP mentality — no over-engineering.
- All prices stored in USD.
- Quality tiers: Frontier / Strong / Good / Budget (curated, not computed).
- Design: light mode, Stripe-clean aesthetic, blue (#2563eb) accent.
- Layout: tabbed (API Pricing / GPU Offers) + breakeven calculator sidebar.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Lint
```

## Directory Structure

```
design/           # Mockups, design docs, visual references
src/              # Application source (Next.js App Router)
  app/            # Pages and API routes
  lib/            # Shared utilities, data fetchers, DB
  components/     # React components
```
