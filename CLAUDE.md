# ReasonsIQ

AI spend optimization platform — helps enterprises understand whether they're overpaying for AI and what alternatives exist. Natural language intake, industry-specific templates, real-time pricing data.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API routes (same repo)
- **Database**: SQLite (via better-sqlite3) for MVP, migrate to PostgreSQL later
- **AI**: Anthropic Claude API (Haiku for intake analysis)
- **Scheduling**: node-cron for data pipeline polling
- **Deployment**: Railway (Docker, standalone Next.js output)
- **Domain**: www.reasonsiq.com (CNAME → Railway, root forwards via GoDaddy)
- **Dev Gate**: HTTP Basic Auth via `DEV_GATE_USER` / `DEV_GATE_PASS` env vars (inactive when unset)

## Data Sources

- **OpenRouter API** (`/api/v1/models`) — LLM API pricing, 300+ models, free, no auth
- **Vast.ai API** (`/api/v0/bundles/`) — GPU marketplace offers, real-time pricing

## Project Conventions

- Keep it simple. MVP mentality — no over-engineering.
- All prices stored in USD.
- Quality tiers: Frontier / Strong / Good / Budget (curated, not computed).
- VRAM requirements by tier: Frontier 80GB+, Strong 40GB+, Good 16GB+, Budget 8GB+.
- Design: light mode, Stripe-clean aesthetic, blue (#2563eb) accent.
- Speak business language, not infrastructure language. "Contracts/week" not "tokens/day".
- Frame value as "we watch the market so you don't have to" — not data freshness stats.

## Product Positioning

**Target buyer:** Enterprise decision-maker (Managing Partner, VP of Engineering, CTO, IT Director)
**Core question we answer:** "Am I overpaying for AI, and what should I do about it?"
**Pricing:** €99/mo Pro · €199/mo Team · €299/mo Enterprise
**Key insight:** The value is ongoing market monitoring + personalized recommendations, not a one-time calculator.

## Roadmap

### Phase 0 — Data Pipeline ✓
- [x] OpenRouter importer (320+ models, refreshes every 6h)
- [x] Vast.ai importer (380+ GPU offers, refreshes every 1h)
- [x] Scheduled polling via node-cron
- [x] Quality tier mapping (curated patterns + param-size heuristic)
- [x] Seed script (`npm run seed`)
- [ ] Shadeform API integration (30+ GPU providers)
- [ ] Historical price storage (append-only for trend analysis)
- [ ] Data validation pipeline

### Phase 1 — AI Spend Analyzer (current — ~85% done)
- [x] **Natural language intake** — describe your setup, AI extracts workload
- [x] **Industry templates** — Legal, Support, Healthcare, Finance
  - [x] Competitor product pricing (Copilot, Harvey, Zendesk AI, Nuance DAX, etc.)
  - [x] Business-friendly inputs (contracts/week, pages/doc, employees, etc.)
- [x] **3-column comparison** — Keep Current vs Switch to API vs Build Custom
  - [x] Current spend tracking (user's stated product + price)
  - [x] Savings vs current calculation
  - [x] GPU purchase prices per model (not hardcoded)
  - [x] GPU count scaling by throughput per quality tier
  - [x] 24-month hardware amortization with CapEx callout
- [x] **Advanced Scenario Builder** — tokens/day, I/O ratio, quality, team size, utilization
- [x] **Claude AI analysis** — Haiku extracts workload from free-text
- [ ] TCO overlay — integration dev cost, maintenance, switching cost estimates
- [ ] Compliance flags per model (SOC 2, data residency, training policy)
- [ ] Multi-GPU provider comparison (beyond Vast.ai)

### Phase 2 — Stickiness & Persistence (next priority)
**Goal:** Make canceling feel like losing something valuable.

#### 2a — User Accounts & Firm Profiles
- [x] Auth (email/password with JWT + httpOnly cookies)
- [ ] **Firm profile** — persists company name, industry, team size, current AI stack
- [ ] Profile auto-populates intake form on return visits
- [ ] "Your firm" dashboard — personalized view, not generic calculator

#### 2b — Saved Scenarios & Decision History
- [ ] Save scenarios with custom names ("Contract Review Migration Q3")
- [ ] Share scenarios with team members (link or email)
- [ ] **Decision log** — track what you chose and when
- [ ] "What you'd have saved" — retroactive analysis of past decisions vs market changes
- [ ] Notes & annotations on scenarios

#### 2c — Monthly AI Spend Report (PDF)
- [ ] Auto-generated monthly PDF for each firm profile
- [ ] Contains: current spend vs market benchmark, what changed this month, recommendations with $ figures, risk assessment, one-page exec summary
- [ ] "CFO cover" — proof of diligence on AI spending
- [ ] Email delivery on schedule

#### 2d — Personalized Alerts
- [ ] "A model matching your workload just dropped 50% in price"
- [ ] "Your competitor product just raised prices"
- [ ] "New compliance-certified model available for your use case"
- [ ] "Your cost is now top 25% for firms your size" (benchmark alert)
- [ ] Email + Slack delivery

#### 2e — Benchmarking
- [ ] Anonymous peer benchmarking — "firms your size and industry spend median $X"
- [ ] Percentile ranking of user's spend
- [ ] Industry trend reports

### Phase 3 — Monetization
- [ ] Stripe subscriptions (€99 Pro / €199 Team / €299 Enterprise)
- [ ] 15-day free trial (full Team access)
- [ ] Tier-gated features:
  - Free: 3 analyses/month, no saved scenarios
  - Pro: unlimited analyses, saved scenarios, monthly report
  - Team: shared scenarios, team profiles, benchmark access
  - Enterprise: API access, custom integrations, dedicated support
- [ ] Actual spend integration (connect Azure/AWS/API billing)

### Phase 4 — Public Launch
- [x] Production deployment (Railway, Docker, custom domain)
- [ ] SEO landing page + blog
- [ ] "AI Spend Index" weekly newsletter
- [ ] Founder-led outreach (LinkedIn, HN, legal tech communities, health IT)

### Phase 5 — Retention & Growth
- [ ] Historical price charts + trend analysis
- [ ] Team workspaces (shared scenarios, RBAC)
- [ ] Actual vs optimized spend tracking (billing integration)
- [ ] Quarterly strategy reviews (Enterprise tier)
- [ ] Slack bot ("what's the cheapest way to serve 10M tokens/day?")

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Lint
npm run seed      # Run data importers (OpenRouter, Vast.ai)
```

**Important:** Always restart the dev server (`npm run dev`) after major changes or commits. Clear the `.next` cache first if you encounter stale module errors: `rm -rf .next && npm run dev`.

## Directory Structure

```
design/                    # Mockups, design docs, visual references
Dockerfile                 # Multi-stage Docker build (standalone Next.js)
railway.toml               # Railway deployment config
src/
  middleware.ts             # Dev gate — Basic Auth when DEV_GATE_USER/PASS are set
  instrumentation.ts       # Next.js hook — starts scheduler on server boot
  app/
    page.tsx               # Homepage: AI intake → results → advanced builder
    layout.tsx             # Root layout
    globals.css            # Global styles
    healthz/route.ts       # GET /healthz — Railway healthcheck (bypasses auth)
    api/
      analyze/route.ts     # POST /api/analyze — Claude AI intake analysis
      models/route.ts      # GET /api/models — API pricing with filtering
      gpus/route.ts        # GET /api/gpus — GPU offers with filtering
      stats/route.ts       # GET /api/stats — summary stats
      breakeven/route.ts   # GET /api/breakeven — simple calculator (legacy)
      scenario/route.ts    # GET /api/scenario — full 3-way comparison
      scenarios/route.ts   # GET/POST /api/scenarios — saved scenarios
      firms/route.ts       # GET/POST /api/firms — firm profiles
      auth/
        register/route.ts  # POST /api/auth/register
        login/route.ts     # POST /api/auth/login
        logout/route.ts    # POST /api/auth/logout
        me/route.ts        # GET /api/auth/me — current user
  lib/
    auth.ts                # JWT auth helpers (hash, verify, cookies)
    auth-context.tsx       # React auth context provider
    db.ts                  # SQLite connection + schema init
    quality-tiers.ts       # Model → quality tier mapping
    industry-templates.ts  # Industry configs, competitor pricing, token math
    scheduler.ts           # node-cron jobs (OpenRouter 6h, Vast.ai 1h)
    seed.ts                # Run all importers
    importers/
      openrouter.ts        # OpenRouter API → api_models
      vastai.ts            # Vast.ai API → gpu_offers
```

## Key Product Insights (from user research)

1. **Speak business, not infrastructure.** "Contracts/week" not "tokens/day". "$3.73/mo" needs TCO context or it triggers suspicion.
2. **Persistent profiles create stickiness.** Saved scenarios become assets. Decision history becomes proof of diligence. Monthly reports become "CFO cover."
3. **Value framing:** "We watch the market so you don't have to" — not "our data updates every 6 hours."
4. **The #1 ask:** "Show me a number I can take to my partners' meeting. My firm's name on it."
5. **Alerts must be personalized.** Generic "Model X dropped 40%" is noise. "A model matching YOUR workload just got cheaper" is actionable.
6. **Compliance is a gate.** Legal/healthcare won't switch without SOC 2, data residency, training policy info.
