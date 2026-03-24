import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

type ModelRow = {
  id: string; model_name: string; provider: string;
  input_price_per_mtok: number; output_price_per_mtok: number; quality_tier: string;
};
type GpuRow = {
  gpu_model: string; price_per_hour: number; region: string;
  reliability_score: number; vram_gb: number;
};

const TIER_RANK: Record<string, number> = { Frontier: 4, Strong: 3, Good: 2, Budget: 1 };

// Owned hardware constants
const H100_PURCHASE_PRICE = 30_000;
const H100_AMORTIZATION_MONTHS = 36;
const POWER_COLO_PER_HOUR = 0.50;
const ENGINEERING_OVERHEAD_PER_PERSON = 500; // $/month ops time per team member

// GPU throughput estimates (tokens/day per GPU, accounting for batching and realistic load)
// These vary by model quality — larger models run slower on the same hardware
const GPU_THROUGHPUT_PER_DAY: Record<string, number> = {
  Frontier: 30_000_000,   // ~350 tok/s — large models (70B+), slower inference
  Strong:   60_000_000,   // ~700 tok/s — mid-size models (30-70B)
  Good:    150_000_000,   // ~1700 tok/s — smaller models (7-13B)
  Budget:  300_000_000,   // ~3500 tok/s — tiny models (<7B)
};

function gpusNeeded(tokensPerDay: number, quality: string): number {
  const throughput = GPU_THROUGHPUT_PER_DAY[quality] || GPU_THROUGHPUT_PER_DAY.Strong;
  return Math.max(1, Math.ceil(tokensPerDay / throughput));
}

function findBestModel(db: ReturnType<typeof getDb>, quality: string, modelId?: string): ModelRow | undefined {
  if (modelId) {
    return db.prepare(`
      SELECT id, model_name, provider, input_price_per_mtok, output_price_per_mtok, quality_tier
      FROM api_models WHERE id = @modelId
    `).get({ modelId }) as ModelRow | undefined;
  }

  const minRank = TIER_RANK[quality] || 3;
  const qualifyingTiers = Object.entries(TIER_RANK)
    .filter(([, rank]) => rank >= minRank)
    .map(([tier]) => tier);
  const placeholders = qualifyingTiers.map((_, i) => `@tier${i}`).join(", ");
  const tierValues: Record<string, string> = {};
  qualifyingTiers.forEach((t, i) => { tierValues[`tier${i}`] = t; });

  return db.prepare(`
    SELECT id, model_name, provider, input_price_per_mtok, output_price_per_mtok, quality_tier
    FROM api_models
    WHERE quality_tier IN (${placeholders}) AND input_price_per_mtok > 0
    ORDER BY input_price_per_mtok ASC
    LIMIT 1
  `).get(tierValues) as ModelRow | undefined;
}

function findBestGpu(db: ReturnType<typeof getDb>, gpuId?: string): GpuRow | undefined {
  if (gpuId) {
    return db.prepare(`
      SELECT gpu_model, price_per_hour, region, reliability_score, vram_gb
      FROM gpu_offers WHERE id = @gpuId
    `).get({ gpuId: parseInt(gpuId) }) as GpuRow | undefined;
  }

  return db.prepare(`
    SELECT gpu_model, price_per_hour, region, reliability_score, vram_gb
    FROM gpu_offers
    WHERE gpu_model LIKE '%H100%'
    ORDER BY price_per_hour ASC
    LIMIT 1
  `).get() as GpuRow | undefined;
}

function computeScenario(
  tokensPerDay: number,
  inputRatio: number,
  model: ModelRow,
  gpu: GpuRow,
  utilization: number,
  teamSize: number,
  quality: string,
) {
  const inputTokensPerDay = tokensPerDay * inputRatio;
  const outputTokensPerDay = tokensPerDay * (1 - inputRatio);

  // Cloud API: pay per token — scales linearly
  const apiDailyCost =
    (inputTokensPerDay / 1_000_000) * model.input_price_per_mtok +
    (outputTokensPerDay / 1_000_000) * model.output_price_per_mtok;
  const apiMonthlyCost = apiDailyCost * 30;

  // How many GPUs are needed for this token volume?
  const numGpus = gpusNeeded(tokensPerDay, quality);

  // Rented GPU: hourly rate × number of GPUs, adjusted for utilization + engineering overhead
  const rentedRawMonthly = gpu.price_per_hour * 24 * 30 * numGpus;
  const rentedUtilAdjusted = rentedRawMonthly / utilization;
  const rentedOverhead = teamSize * ENGINEERING_OVERHEAD_PER_PERSON;
  const rentedMonthlyCost = rentedUtilAdjusted + rentedOverhead;

  // Owned hardware: amortized purchase × GPUs + power/colo × GPUs + engineering
  const ownedAmortized = (H100_PURCHASE_PRICE / H100_AMORTIZATION_MONTHS) * numGpus;
  const ownedPowerColo = POWER_COLO_PER_HOUR * 24 * 30 * numGpus;
  const ownedOverhead = teamSize * ENGINEERING_OVERHEAD_PER_PERSON;
  const ownedMonthlyCost = ownedAmortized + ownedPowerColo + ownedOverhead;

  return {
    cloud_api: {
      monthly_cost: apiMonthlyCost,
      daily_cost: apiDailyCost,
      cost_per_1k_tokens: tokensPerDay > 0 ? (apiDailyCost / tokensPerDay) * 1000 : 0,
    },
    rented_gpu: {
      monthly_cost: rentedMonthlyCost,
      daily_cost: rentedMonthlyCost / 30,
      raw_monthly: rentedRawMonthly,
      utilization_adjusted: rentedUtilAdjusted,
      overhead: rentedOverhead,
      gpu_count: numGpus,
    },
    owned_hardware: {
      monthly_cost: ownedMonthlyCost,
      daily_cost: ownedMonthlyCost / 30,
      amortized_hw: ownedAmortized,
      power_colo: ownedPowerColo,
      overhead: ownedOverhead,
      gpu_count: numGpus,
    },
  };
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const params = request.nextUrl.searchParams;

  const tokensPerDay = parseInt(params.get("tokens") || "10000000");
  const inputRatio = Math.max(0, Math.min(1, parseFloat(params.get("inputRatio") || "0.6")));
  const quality = params.get("quality") || "Strong";
  const teamSize = Math.max(1, Math.min(50, parseInt(params.get("teamSize") || "1")));
  const utilization = Math.max(0.1, Math.min(1, parseFloat(params.get("utilization") || "0.7")));
  const modelId = params.get("modelId") || undefined;
  const gpuId = params.get("gpuId") || undefined;

  const model = findBestModel(db, quality, modelId);
  const gpu = findBestGpu(db, gpuId);

  if (!model || !gpu) {
    return NextResponse.json({ error: "Insufficient data for scenario" }, { status: 404 });
  }

  const options = computeScenario(tokensPerDay, inputRatio, model, gpu, utilization, teamSize, quality);

  // Determine recommendation
  const costs = [
    { key: "cloud_api", cost: options.cloud_api.monthly_cost },
    { key: "rented_gpu", cost: options.rented_gpu.monthly_cost },
    { key: "owned_hardware", cost: options.owned_hardware.monthly_cost },
  ];
  costs.sort((a, b) => a.cost - b.cost);
  const recommendation = costs[0].key;
  const maxCost = costs[2].cost;
  const savingsVsMax = maxCost > 0 ? ((maxCost - costs[0].cost) / maxCost) * 100 : 0;

  return NextResponse.json({
    inputs: { tokens_per_day: tokensPerDay, input_ratio: inputRatio, quality, team_size: teamSize, utilization },
    model: {
      id: model.id,
      name: model.model_name,
      provider: model.provider,
      quality_tier: model.quality_tier,
      input_price: model.input_price_per_mtok,
      output_price: model.output_price_per_mtok,
    },
    gpu: {
      model: gpu.gpu_model,
      price_per_hour: gpu.price_per_hour,
      region: gpu.region,
      vram_gb: gpu.vram_gb,
    },
    options,
    recommendation,
    savings_vs_max: savingsVsMax,
  });
}
