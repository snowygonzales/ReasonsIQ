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

## Milestones

### Milestone 1 — Data Pipeline (Day 1)
- [x] Project scaffold (Next.js 15, TypeScript, Tailwind 4, SQLite)
- [x] DB schema: `api_models`, `gpu_offers`, `sync_log` tables with indexes
- [x] OpenRouter importer: fetch, normalize, upsert (347 models, 0 errors)
- [x] Quality tier mapping (curated patterns + param-size heuristic fallback)
- [x] Seed script (`npm run seed`) to run importers on demand
- [ ] Vast.ai importer: fetch, normalize, upsert
- [ ] Data validation + scheduled polling (node-cron: OpenRouter 6h, Vast.ai 1h)

### Milestone 2 — Dashboard + Calculator (Day 2)
- [ ] API routes: `GET /api/models`, `GET /api/gpus` with filtering/sorting
- [ ] Dashboard page: stats bar, tabbed tables (API Pricing / GPU Offers)
- [ ] Quality tier column with color-coded badges
- [ ] Search, provider filter, quality filter, pagination
- [ ] Breakeven calculator sidebar (tokens/day, latency, min quality, model picker)
- [ ] Breakeven calculation logic (API cost vs GPU self-host cost)
- [ ] Data freshness indicators + last sync timestamps

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Lint
npm run seed      # Run data importers (OpenRouter, Vast.ai)
```

## Directory Structure

```
design/           # Mockups, design docs, visual references
src/              # Application source (Next.js App Router)
  app/            # Pages and API routes
  lib/            # Shared utilities, data fetchers, DB
  components/     # React components
```
