import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const db = getDb();
  const params = request.nextUrl.searchParams;

  const gpuModel = params.get("gpu_model") || "";
  const region = params.get("region") || "";
  const minVram = params.get("min_vram") || "";
  const sort = params.get("sort") || "price_per_hour";
  const order = params.get("order") === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: Record<string, string | number> = {};

  if (gpuModel) {
    conditions.push("gpu_model LIKE @gpuModel");
    values.gpuModel = `%${gpuModel}%`;
  }
  if (region) {
    conditions.push("region = @region");
    values.region = region;
  }
  if (minVram) {
    conditions.push("vram_gb >= @minVram");
    values.minVram = parseFloat(minVram);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const allowedSorts = ["price_per_hour", "gpu_model", "vram_gb", "reliability_score", "dlperf", "region"];
  const sortCol = allowedSorts.includes(sort) ? sort : "price_per_hour";

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM gpu_offers ${where}`).get(values) as { total: number };
  const offers = db.prepare(
    `SELECT id, provider, gpu_model, gpu_count, vram_gb, price_per_hour,
      cpu_cores, ram_gb, disk_gb, internet_speed_mbps, region,
      reliability_score, dlperf, verified, updated_at
    FROM gpu_offers ${where}
    ORDER BY ${sortCol} ${order}
    LIMIT @limit OFFSET @offset`
  ).all({ ...values, limit, offset });

  // Stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_offers,
      COUNT(DISTINCT gpu_model) as gpu_models,
      MIN(price_per_hour) as cheapest_price
    FROM gpu_offers
  `).get() as { total_offers: number; gpu_models: number; cheapest_price: number };

  const cheapestGpu = db.prepare(
    `SELECT gpu_model, region FROM gpu_offers WHERE price_per_hour = @price LIMIT 1`
  ).get({ price: stats.cheapest_price }) as { gpu_model: string; region: string } | undefined;

  // Cheapest H100
  const cheapestH100 = db.prepare(
    `SELECT MIN(price_per_hour) as price, region FROM gpu_offers WHERE gpu_model LIKE '%H100%'`
  ).get() as { price: number | null; region: string | null };

  const lastSync = db.prepare(
    `SELECT synced_at FROM sync_log WHERE source = 'vast.ai' ORDER BY synced_at DESC LIMIT 1`
  ).get() as { synced_at: string } | undefined;

  return NextResponse.json({
    offers,
    pagination: { page, limit, total: countRow.total, pages: Math.ceil(countRow.total / limit) },
    stats: {
      total_offers: stats.total_offers,
      gpu_models: stats.gpu_models,
      cheapest_price: stats.cheapest_price,
      cheapest_gpu: cheapestGpu?.gpu_model,
      cheapest_gpu_region: cheapestGpu?.region,
      cheapest_h100: cheapestH100?.price,
      cheapest_h100_region: cheapestH100?.region,
      last_sync: lastSync?.synced_at,
    },
  });
}
