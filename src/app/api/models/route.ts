import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const db = getDb();
  const params = request.nextUrl.searchParams;

  const search = params.get("search") || "";
  const provider = params.get("provider") || "";
  const quality = params.get("quality") || "";
  const sort = params.get("sort") || "input_price_per_mtok";
  const order = params.get("order") === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: Record<string, string | number> = {};

  if (search) {
    conditions.push("(model_name LIKE @search OR id LIKE @search)");
    values.search = `%${search}%`;
  }
  if (provider) {
    conditions.push("provider = @provider");
    values.provider = provider;
  }
  if (quality) {
    conditions.push("quality_tier = @quality");
    values.quality = quality;
  }

  // Always exclude free/zero-price models from default view
  conditions.push("input_price_per_mtok > 0");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const allowedSorts = ["input_price_per_mtok", "output_price_per_mtok", "context_length", "model_name", "provider", "quality_tier"];
  const sortCol = allowedSorts.includes(sort) ? sort : "input_price_per_mtok";

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM api_models ${where}`).get(values) as { total: number };
  const models = db.prepare(
    `SELECT id, provider, model_name, description, context_length,
      input_price_per_mtok, output_price_per_mtok, quality_tier, updated_at
    FROM api_models ${where}
    ORDER BY ${sortCol} ${order}
    LIMIT @limit OFFSET @offset`
  ).all({ ...values, limit, offset });

  // Stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_models,
      COUNT(DISTINCT provider) as providers,
      MIN(CASE WHEN input_price_per_mtok > 0 THEN input_price_per_mtok END) as cheapest_input
    FROM api_models WHERE input_price_per_mtok > 0
  `).get() as { total_models: number; providers: number; cheapest_input: number };

  const cheapestModel = db.prepare(
    `SELECT model_name FROM api_models WHERE input_price_per_mtok = @price AND input_price_per_mtok > 0 LIMIT 1`
  ).get({ price: stats.cheapest_input }) as { model_name: string } | undefined;

  const lastSync = db.prepare(
    `SELECT synced_at FROM sync_log WHERE source = 'openrouter' ORDER BY synced_at DESC LIMIT 1`
  ).get() as { synced_at: string } | undefined;

  return NextResponse.json({
    models,
    pagination: { page, limit, total: countRow.total, pages: Math.ceil(countRow.total / limit) },
    stats: {
      total_models: stats.total_models,
      providers: stats.providers,
      cheapest_input: stats.cheapest_input,
      cheapest_model: cheapestModel?.model_name,
      last_sync: lastSync?.synced_at,
    },
  });
}
