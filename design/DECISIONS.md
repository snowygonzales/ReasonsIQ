# Design Decisions

## Layout: Tabbed + Calculator Sidebar
- **Chosen**: Tabbed data tables (API Pricing / GPU Offers) with persistent breakeven calculator in right sidebar (~35% width)
- **Rejected**: Full-scroll single page (too long), three-column (too cramped)
- **Rationale**: Clean, focused — user sees one data source at a time while always having the calculator accessible

## Visual Style: Light Mode, Clean
- White background, light gray (#f7f7f8) page bg, white cards
- Blue (#2563eb) accent for active states, provider badges
- Green (#16a34a) for low prices / savings indicators
- Purple (#7c3aed) for GPU-related values
- Amber (#92400e on #fef3c7) for Frontier tier badge
- Font: system font stack (-apple-system, BlinkMacSystemFont, etc.)
- Stripe dashboard aesthetic — CFO-screenshot-ready

## Quality Tiers
- **Frontier**: GPT-4o, Claude Opus/Sonnet, Gemini Pro — top benchmark performers
- **Strong**: DeepSeek V3, Llama 70B+, Qwen 72B, Gemini Flash, Mistral Large — excellent for most production use
- **Good**: GPT-4o Mini, Mistral 7B, Phi-3 — solid for focused tasks
- **Budget**: Tiny/nano models — cost-optimized, lower quality
- Tiers are curated (manually assigned based on known benchmarks), not computed
- Calculator defaults to "Strong (recommended)" as minimum quality floor
- "Best value at tier" auto-selects cheapest model meeting the quality floor

## Stats Bar
4 summary cards: API model count, GPU offer count, cheapest API per 1M tokens, cheapest H100/hr

## Breakeven Calculator Fields
1. Tokens per day (numeric input)
2. Latency requirement (dropdown: <500ms interactive, <2s batch-ok, no requirement)
3. Min. quality (dropdown: Frontier, Strong, Good, Budget, Any)
4. Compare model (auto-populated from best value at tier, or manual override)
