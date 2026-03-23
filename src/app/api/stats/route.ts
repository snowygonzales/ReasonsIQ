import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();

  const modelStats = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT provider) as providers,
      MIN(CASE WHEN input_price_per_mtok > 0 THEN input_price_per_mtok END) as cheapest_input
    FROM api_models WHERE input_price_per_mtok > 0
  `).get() as { count: number; providers: number; cheapest_input: number };

  const cheapestModel = db.prepare(
    `SELECT model_name FROM api_models WHERE input_price_per_mtok = @p AND input_price_per_mtok > 0 LIMIT 1`
  ).get({ p: modelStats.cheapest_input }) as { model_name: string } | undefined;

  const gpuStats = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT gpu_model) as models
    FROM gpu_offers
  `).get() as { count: number; models: number };

  const cheapestH100 = db.prepare(`
    SELECT MIN(price_per_hour) as price, region, reliability_score
    FROM gpu_offers WHERE gpu_model LIKE '%H100%'
  `).get() as { price: number | null; region: string | null; reliability_score: number | null };

  const lastSyncs = db.prepare(`
    SELECT source, MAX(synced_at) as synced_at
    FROM sync_log WHERE status IN ('success', 'partial')
    GROUP BY source
  `).all() as Array<{ source: string; synced_at: string }>;

  return NextResponse.json({
    api_models: {
      count: modelStats.count,
      providers: modelStats.providers,
      cheapest_input: modelStats.cheapest_input,
      cheapest_model: cheapestModel?.model_name,
    },
    gpu_offers: {
      count: gpuStats.count,
      gpu_models: gpuStats.models,
      cheapest_h100_price: cheapestH100?.price,
      cheapest_h100_region: cheapestH100?.region,
      cheapest_h100_reliability: cheapestH100?.reliability_score,
    },
    last_syncs: Object.fromEntries(lastSyncs.map((s) => [s.source, s.synced_at])),
  });
}
