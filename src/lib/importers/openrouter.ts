import { getDb } from "../db";
import { assignQualityTier } from "../quality-tiers";

const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

function extractProvider(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash === -1) return "unknown";
  return modelId.substring(0, slash);
}

function toMillionTokenPrice(perTokenPrice: string | undefined): number | null {
  if (!perTokenPrice) return null;
  const price = parseFloat(perTokenPrice);
  if (isNaN(price) || price < 0) return null;
  // OpenRouter returns price per token, convert to per million tokens
  return Math.round(price * 1_000_000 * 1_000_000) / 1_000_000; // 6 decimal places
}

function validateModel(model: OpenRouterModel): boolean {
  if (!model.id || !model.name) return false;
  const inputPrice = toMillionTokenPrice(model.pricing?.prompt);
  const outputPrice = toMillionTokenPrice(model.pricing?.completion);
  // Skip models with no pricing at all
  if (inputPrice === null && outputPrice === null) return false;
  // Sanity check: prices shouldn't be absurdly high (> $1000/M tokens)
  if (inputPrice !== null && inputPrice > 1000) return false;
  if (outputPrice !== null && outputPrice > 1000) return false;
  return true;
}

export async function importOpenRouter(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const db = getDb();

  console.log("[OpenRouter] Fetching models...");
  const response = await fetch(OPENROUTER_API);

  if (!response.ok) {
    throw new Error(`OpenRouter API returned ${response.status}: ${response.statusText}`);
  }

  const data: OpenRouterResponse = await response.json();
  console.log(`[OpenRouter] Received ${data.data.length} models`);

  const upsert = db.prepare(`
    INSERT INTO api_models (id, provider, model_name, description, context_length,
      input_price_per_mtok, output_price_per_mtok, image_input_price, quality_tier, updated_at)
    VALUES (@id, @provider, @model_name, @description, @context_length,
      @input_price_per_mtok, @output_price_per_mtok, @image_input_price, @quality_tier, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      provider = @provider,
      model_name = @model_name,
      description = @description,
      context_length = @context_length,
      input_price_per_mtok = @input_price_per_mtok,
      output_price_per_mtok = @output_price_per_mtok,
      image_input_price = @image_input_price,
      quality_tier = @quality_tier,
      updated_at = datetime('now')
  `);

  let count = 0;
  const insertMany = db.transaction((models: OpenRouterModel[]) => {
    for (const model of models) {
      if (!validateModel(model)) {
        continue;
      }
      try {
        upsert.run({
          id: model.id,
          provider: extractProvider(model.id),
          model_name: model.name,
          description: model.description?.slice(0, 500) || null,
          context_length: model.context_length || null,
          input_price_per_mtok: toMillionTokenPrice(model.pricing?.prompt),
          output_price_per_mtok: toMillionTokenPrice(model.pricing?.completion),
          image_input_price: toMillionTokenPrice(model.pricing?.image),
          quality_tier: assignQualityTier(model.id),
        });
        count++;
      } catch (err) {
        errors.push(`Failed to upsert ${model.id}: ${err}`);
      }
    }
  });

  insertMany(data.data);

  // Log sync
  db.prepare(`
    INSERT INTO sync_log (source, status, records_count, error_message)
    VALUES ('openrouter', @status, @count, @errors)
  `).run({
    status: errors.length > 0 ? "partial" : "success",
    count,
    errors: errors.length > 0 ? errors.join("; ") : null,
  });

  console.log(`[OpenRouter] Imported ${count} models (${errors.length} errors)`);
  return { count, errors };
}
