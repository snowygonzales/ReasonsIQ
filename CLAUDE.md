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

## Roadmap

### Phase 0 — Data Pipeline Validation (~70% done)
- [x] OpenRouter importer (347 models)
- [x] Vast.ai importer (392 GPU offers, 19 GPU types)
- [x] Scheduled polling (node-cron: OpenRouter 6h, Vast.ai 1h)
- [x] Quality tier mapping (curated patterns + param-size heuristic)
- [x] Seed script (`npm run seed`)
- [ ] Shadeform API integration (30+ GPU providers)
- [ ] Apify GPU Monitor integration
- [ ] Scraping fallbacks for provider pricing pages
- [ ] Historical price storage (DB currently upserts, needs append-only history)
- [ ] Data validation pipeline (cross-check against official pricing pages)

### Phase 1 — MVP Product (~40% done)
- [x] Live pricing dashboard (API + GPU tables, stats bar)
- [x] Breakeven calculator (API vs GPU, server-side)
- [x] Row selection feeds into calculator
- [x] Search, provider filter, quality filter, column sorting, pagination
- [x] Data freshness indicators + last sync timestamps
- [ ] **Scenario Builder** — full workload profiling
  - [ ] Inputs: tokens/day, latency SLA, compliance needs, team size
  - [ ] Side-by-side: cloud API vs rented GPU vs owned metal
  - [ ] Utilization rates, engineering overhead multipliers
  - [ ] Scaling curves / projection charts
- [ ] Prompt caching discounts, batch API rates, volume tiers
- [ ] Model benchmarks (HuggingFace Leaderboard via Parquet)
  - [ ] Quality-adjusted cost metric ($/benchmark-point)
- [ ] Multi-GPU provider comparison (beyond Vast.ai)
- [ ] Recharts visualizations (cost comparison charts)

### Phase 2 — Monetization
- [ ] Auth (email/password)
- [ ] Stripe subscriptions (€99 Pro / €199 Team / €299 Enterprise)
- [ ] 15-day free trial flow (full Team access)
- [ ] Tier-gated features
- [ ] PDF/XLSX export of scenarios
- [ ] Shareable scenario links

### Phase 3 — Public Launch
- [ ] Production deployment (Vercel frontend + Hetzner VPS backend)
- [ ] SEO landing page + blog
- [ ] "Inference Price Index" weekly newsletter
- [ ] Founder-led outreach (LinkedIn, HN, MLOps communities)

### Phase 4 — Retention Features (post-launch)
- [ ] Historical price charts + trend analysis
- [ ] Price change alerts (email + Slack)
- [ ] News & trends feed (provider blogs, HuggingFace, RSS)
- [ ] Team workspaces (shared scenarios, RBAC)
- [ ] Slack bot ("cheapest way to serve 10M tokens/day?")

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Lint
npm run seed      # Run data importers (OpenRouter, Vast.ai)
```

## Directory Structure

```
design/                    # Mockups, design docs, visual references
src/
  instrumentation.ts       # Next.js hook — starts scheduler on server boot
  app/
    page.tsx               # Dashboard (stats, tables, calculator)
    layout.tsx             # Root layout
    globals.css            # Global styles
    api/
      models/route.ts      # GET /api/models — API pricing with filtering
      gpus/route.ts        # GET /api/gpus — GPU offers with filtering
      stats/route.ts       # GET /api/stats — summary stats
      breakeven/route.ts   # GET /api/breakeven — calculator logic
  lib/
    db.ts                  # SQLite connection + schema init
    quality-tiers.ts       # Model → quality tier mapping
    scheduler.ts           # node-cron jobs (OpenRouter 6h, Vast.ai 1h)
    seed.ts                # Run all importers
    importers/
      openrouter.ts        # OpenRouter API → api_models
      vastai.ts            # Vast.ai API → gpu_offers
```
