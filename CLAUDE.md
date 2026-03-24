# InferenceIQ

LLM cost intelligence platform — aggregates API pricing, GPU compute costs, and quality benchmarks into a single decision-support dashboard.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
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
- VRAM requirements by tier: Frontier 80GB+, Strong 40GB+, Good 16GB+, Budget 8GB+.
- Design: light mode, Stripe-clean aesthetic, blue (#2563eb) accent.
- Layout: Quick Scenarios → Cost Comparison → Advanced Scenario Builder.

## Roadmap

### Phase 0 — Data Pipeline Validation (~70% done)
- [x] OpenRouter importer (320+ models)
- [x] Vast.ai importer (380+ GPU offers, 19 GPU types)
- [x] Scheduled polling (node-cron: OpenRouter 6h, Vast.ai 1h)
- [x] Quality tier mapping (curated patterns + param-size heuristic)
- [x] Seed script (`npm run seed`)
- [ ] Shadeform API integration (30+ GPU providers)
- [ ] Apify GPU Monitor integration
- [ ] Scraping fallbacks for provider pricing pages
- [ ] Historical price storage (DB currently upserts, needs append-only history)
- [ ] Data validation pipeline (cross-check against official pricing pages)

### Phase 1 — MVP Product (~75% done)
- [x] ~~Live pricing dashboard~~ (replaced by Scenario Builder)
- [x] Breakeven calculator (API vs GPU, server-side)
- [x] **Scenario Builder** — full workload profiling
  - [x] 3 Quick Scenarios: Customer Support Chatbot, Knowledge Base, Document Analysis
  - [x] Business-friendly inputs (conversations, replies, employees, pages)
  - [x] Model strength selector (Frontier/Strong/Good/Budget)
  - [x] GPU selector filtered by VRAM requirements, sorted by region proximity
  - [x] Browser geolocation for auto-detecting nearest GPU region
  - [x] Side-by-side: Cloud API vs Rented GPU vs Owned Hardware
  - [x] GPU count scaling based on throughput per quality tier
  - [x] Utilization rates, engineering overhead multipliers
  - [x] Cost breakdown with transparent math
- [x] **Advanced Scenario Builder** — fine-grained controls
  - [x] Tokens/day with presets, input/output ratio slider
  - [x] Searchable model selector (300+ models)
  - [x] Searchable GPU selector with type filters
  - [x] Team size, utilization rate, latency requirements
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
    page.tsx               # Homepage: Quick Scenarios + Cost Comparison + Advanced Builder
    layout.tsx             # Root layout
    globals.css            # Global styles
    api/
      models/route.ts      # GET /api/models — API pricing with filtering
      gpus/route.ts        # GET /api/gpus — GPU offers with filtering
      stats/route.ts       # GET /api/stats — summary stats
      breakeven/route.ts   # GET /api/breakeven — simple calculator logic
      scenario/route.ts    # GET /api/scenario — full scenario comparison (3 deployment options)
  lib/
    db.ts                  # SQLite connection + schema init
    quality-tiers.ts       # Model → quality tier mapping
    scheduler.ts           # node-cron jobs (OpenRouter 6h, Vast.ai 1h)
    seed.ts                # Run all importers
    importers/
      openrouter.ts        # OpenRouter API → api_models
      vastai.ts            # Vast.ai API → gpu_offers
```
