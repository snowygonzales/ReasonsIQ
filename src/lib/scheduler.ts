import cron from "node-cron";
import { importOpenRouter } from "./importers/openrouter";
import { importVastai } from "./importers/vastai";

let initialized = false;

export function startScheduler() {
  if (initialized) return;
  initialized = true;

  // OpenRouter: every 6 hours (at :05 past to avoid exact hour)
  cron.schedule("5 */6 * * *", async () => {
    console.log(`[Scheduler] OpenRouter import starting — ${new Date().toISOString()}`);
    try {
      const result = await importOpenRouter();
      console.log(`[Scheduler] OpenRouter done — ${result.count} models (${result.errors.length} errors)`);
    } catch (err) {
      console.error("[Scheduler] OpenRouter import failed:", err);
    }
  });

  // Vast.ai: every 1 hour (at :10 past)
  cron.schedule("10 * * * *", async () => {
    console.log(`[Scheduler] Vast.ai import starting — ${new Date().toISOString()}`);
    try {
      const result = await importVastai();
      console.log(`[Scheduler] Vast.ai done — ${result.count} offers (${result.errors.length} errors)`);
    } catch (err) {
      console.error("[Scheduler] Vast.ai import failed:", err);
    }
  });

  console.log("[Scheduler] Cron jobs registered — OpenRouter every 6h, Vast.ai every 1h");
}
