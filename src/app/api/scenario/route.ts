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
const AMORTIZATION_MONTHS = 24; // industry standard for AI hardware CapEx
const POWER_COLO_PER_HOUR = 0.50;
const ENGINEERING_OVERHEAD_PER_PERSON = 500; // $/month ops time per team member

// Approximate retail purchase prices per GPU (USD)
const GPU_PURCHASE_PRICE: Record<string, number> = {
  "H200":        35_000,
  "B200":        40_000,
  "H100 SXM":    30_000,
  "H100 PCIe":   25_000,
  "H100 NVL":    30_000,
  "H100":        30_000,
  "A100 SXM":    15_000,
  "A100 PCIe":   10_000,
  "A100 PCIE":   10_000,
  "A100":        10_000,
  "A100X":       12_000,
  "L40S":         8_000,
  "L40":          7_000,
  "L4":           2_500,
  "A40":          5_000,
  "A30":          3_500,
  "A10":          2_000,
  "RTX A6000":    4_500,
  "RTX A5000":    2_500,
  "RTX A4000":    1_000,
  "RTX 5090":     2_000,
  "RTX 4090":     1_600,
  "RTX 3090 Ti":  1_500,
  "RTX 3090":     1_300,
};

function getGpuPurchasePrice(gpuModel: string): number {
  // Exact match first
  if (GPU_PURCHASE_PRICE[gpuModel]) return GPU_PURCHASE_PRICE[gpuModel];
  // Partial match (e.g., "H100 SXM" matches "H100")
  for (const [key, price] of Object.entries(GPU_PURCHASE_PRICE)) {
    if (gpuModel.includes(key) || key.includes(gpuModel)) return price;
  }
  return 5_000; // fallback for unknown GPUs
}

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
  const gpuPrice = getGpuPurchasePrice(gpu.gpu_model);
  const ownedPerGpuMonthly = gpuPrice / AMORTIZATION_MONTHS;
  const ownedAmortized = ownedPerGpuMonthly * numGpus;
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
      per_gpu_monthly: ownedPerGpuMonthly,
      per_gpu_price: gpuPrice,
      upfront_cost: gpuPrice * numGpus,
      amortization_months: AMORTIZATION_MONTHS,
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
  const currentSpend = parseFloat(params.get("currentSpend") || "0");
  const currentProduct = params.get("currentProduct") || "";

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

  // Savings vs current spend
  const bestAlternativeCost = Math.min(options.cloud_api.monthly_cost, options.rented_gpu.monthly_cost, options.owned_hardware.monthly_cost);
  const savingsVsCurrent = currentSpend > 0 ? ((currentSpend - bestAlternativeCost) / currentSpend) * 100 : 0;

  return NextResponse.json({
    inputs: { tokens_per_day: tokensPerDay, input_ratio: inputRatio, quality, team_size: teamSize, utilization },
    current: currentSpend > 0 ? { product: currentProduct, monthly_spend: currentSpend } : null,
    savings_vs_current: currentSpend > 0 ? savingsVsCurrent : null,
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
