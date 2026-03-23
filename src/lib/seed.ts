import { importOpenRouter } from "./importers/openrouter";
import { importVastai } from "./importers/vastai";
import { getDb } from "./db";

async function seed() {
  console.log("=== InferenceIQ Data Seed ===\n");

  // Ensure DB is initialized
  getDb();

  // OpenRouter
  console.log("--- OpenRouter Import ---");
  const orResult = await importOpenRouter();
  console.log(`  Models: ${orResult.count}`);
  if (orResult.errors.length > 0) {
    console.log(`  Errors: ${orResult.errors.length}`);
  }

  // Vast.ai
  console.log("\n--- Vast.ai Import ---");
  const vastResult = await importVastai();
  console.log(`  GPU offers: ${vastResult.count}`);
  if (vastResult.errors.length > 0) {
    console.log(`  Errors: ${vastResult.errors.length}`);
  }

  // Print summary
  const db = getDb();
  const modelCount = db.prepare("SELECT COUNT(*) as count FROM api_models").get() as { count: number };
  const gpuCount = db.prepare("SELECT COUNT(*) as count FROM gpu_offers").get() as { count: number };
  const tierCounts = db.prepare("SELECT quality_tier, COUNT(*) as count FROM api_models GROUP BY quality_tier ORDER BY count DESC").all() as Array<{ quality_tier: string; count: number }>;
  const cheapestModels = db.prepare("SELECT model_name, input_price_per_mtok FROM api_models WHERE input_price_per_mtok > 0 ORDER BY input_price_per_mtok LIMIT 5").all() as Array<{ model_name: string; input_price_per_mtok: number }>;
  const gpuByModel = db.prepare("SELECT gpu_model, COUNT(*) as count, MIN(price_per_hour) as min_price FROM gpu_offers GROUP BY gpu_model ORDER BY min_price").all() as Array<{ gpu_model: string; count: number; min_price: number }>;

  console.log(`\n--- Summary ---`);
  console.log(`API models: ${modelCount.count}`);
  console.log(`GPU offers: ${gpuCount.count}`);

  console.log(`\nAPI models by quality tier:`);
  for (const t of tierCounts) {
    console.log(`  ${t.quality_tier}: ${t.count}`);
  }

  console.log(`\nCheapest 5 API models (input/1M tokens):`);
  for (const m of cheapestModels) {
    console.log(`  $${m.input_price_per_mtok.toFixed(4)} — ${m.model_name}`);
  }

  console.log(`\nGPU offers by model (cheapest first):`);
  for (const g of gpuByModel) {
    console.log(`  $${g.min_price.toFixed(2)}/hr — ${g.gpu_model} (${g.count} offers)`);
  }

  console.log("\n=== Seed complete ===");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
