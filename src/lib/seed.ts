import { importOpenRouter } from "./importers/openrouter";
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

  // Print summary
  const db = getDb();
  const modelCount = db.prepare("SELECT COUNT(*) as count FROM api_models").get() as { count: number };
  const tierCounts = db.prepare("SELECT quality_tier, COUNT(*) as count FROM api_models GROUP BY quality_tier ORDER BY count DESC").all() as Array<{ quality_tier: string; count: number }>;
  const cheapest = db.prepare("SELECT model_name, input_price_per_mtok FROM api_models WHERE input_price_per_mtok > 0 ORDER BY input_price_per_mtok LIMIT 5").all() as Array<{ model_name: string; input_price_per_mtok: number }>;

  console.log(`\n--- Summary ---`);
  console.log(`Total models: ${modelCount.count}`);
  console.log(`\nBy quality tier:`);
  for (const t of tierCounts) {
    console.log(`  ${t.quality_tier}: ${t.count}`);
  }
  console.log(`\nCheapest 5 (input/1M tokens):`);
  for (const m of cheapest) {
    console.log(`  $${m.input_price_per_mtok.toFixed(4)} — ${m.model_name}`);
  }

  console.log("\n=== Seed complete ===");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
