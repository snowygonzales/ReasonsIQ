import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const db = getDb();
  const params = request.nextUrl.searchParams;

  const quality = params.get("quality") || "Strong";
  const tokens = parseInt(params.get("tokens") || "10000000");

  // Quality tier ranking for "at least" filtering
  const tiers: Record<string, number> = { Frontier: 4, Strong: 3, Good: 2, Budget: 1 };
  const minRank = tiers[quality] || 3;

  // Get all qualifying tiers
  const qualifyingTiers = Object.entries(tiers)
    .filter(([, rank]) => rank >= minRank)
    .map(([tier]) => tier);

  const placeholders = qualifyingTiers.map((_, i) => `@tier${i}`).join(", ");
  const tierValues: Record<string, string> = {};
  qualifyingTiers.forEach((t, i) => { tierValues[`tier${i}`] = t; });

  // Find cheapest model at or above quality tier
  const bestModel = db.prepare(`
    SELECT id, model_name, provider, input_price_per_mtok, output_price_per_mtok, quality_tier
    FROM api_models
    WHERE quality_tier IN (${placeholders}) AND input_price_per_mtok > 0
    ORDER BY input_price_per_mtok ASC
    LIMIT 1
  `).get(tierValues) as {
    id: string; model_name: string; provider: string;
    input_price_per_mtok: number; output_price_per_mtok: number; quality_tier: string;
  } | undefined;

  // Find cheapest H100 GPU
  const bestGpu = db.prepare(`
    SELECT gpu_model, price_per_hour, region, reliability_score
    FROM gpu_offers
    WHERE gpu_model LIKE '%H100%'
    ORDER BY price_per_hour ASC
    LIMIT 1
  `).get() as { gpu_model: string; price_per_hour: number; region: string; reliability_score: number } | undefined;

  if (!bestModel || !bestGpu) {
    return NextResponse.json({ error: "Insufficient data for comparison" }, { status: 404 });
  }

  const apiCostPerDay = (tokens / 1_000_000) * bestModel.input_price_per_mtok;
  const gpuCostPerDay = bestGpu.price_per_hour * 24;
  const savings = apiCostPerDay > 0 ? (1 - gpuCostPerDay / apiCostPerDay) * 100 : 0;
  const breakevenTokens = bestModel.input_price_per_mtok > 0
    ? (gpuCostPerDay / (bestModel.input_price_per_mtok / 1_000_000))
    : 0;

  return NextResponse.json({
    api: {
      model: bestModel.model_name,
      provider: bestModel.provider,
      quality_tier: bestModel.quality_tier,
      price_per_mtok: bestModel.input_price_per_mtok,
      cost_per_day: apiCostPerDay,
    },
    gpu: {
      model: bestGpu.gpu_model,
      price_per_hour: bestGpu.price_per_hour,
      region: bestGpu.region,
      reliability: bestGpu.reliability_score,
      cost_per_day: gpuCostPerDay,
    },
    comparison: {
      savings_percent: savings,
      savings_per_day: apiCostPerDay - gpuCostPerDay,
      savings_per_month: (apiCostPerDay - gpuCostPerDay) * 30,
      breakeven_tokens_per_day: breakevenTokens,
      recommendation: savings > 0 ? "self-host" : "api",
    },
  });
}
