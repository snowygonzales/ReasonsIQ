import { getDb } from "../db";

const VASTAI_API = "https://cloud.vast.ai/api/v0/bundles/";

// GPU models relevant for LLM inference
const INFERENCE_GPUS = [
  "RTX 5090", "RTX 4090", "RTX 3090", "RTX 3090 Ti",
  "RTX A6000", "RTX A5000", "RTX A4000",
  "A100 SXM", "A100 PCIe", "A100",
  "H100 SXM", "H100 PCIe", "H100 NVL", "H100",
  "H200", "B200", "L40S", "L40", "L4",
  "A40", "A10", "A30",
];

interface VastOffer {
  id: number;
  gpu_name: string;
  num_gpus: number;
  gpu_ram: number; // MB
  dph_total: number;
  cpu_cores: number;
  cpu_ram: number; // MB
  disk_space: number; // GB
  disk_name?: string;
  inet_up: number;
  inet_down: number;
  reliability: number;
  dlperf: number;
  score: number;
  geolocation: string;
  rentable?: boolean;
  rented?: boolean;
  verified?: boolean;
  static_ip: boolean;
}

interface VastResponse {
  offers: VastOffer[];
}

function validateOffer(offer: VastOffer): boolean {
  if (!offer.gpu_name || !offer.id) return false;
  if (offer.rentable === false || offer.rented === true) return false;
  if (offer.dph_total <= 0 || offer.dph_total > 100) return false; // sanity: $0-$100/hr
  if (offer.gpu_ram <= 0) return false;
  return true;
}

function extractRegion(geolocation: string): string {
  if (!geolocation) return "Unknown";
  // Vast.ai geolocation is like "US, California" or "DE, Bavaria"
  const parts = geolocation.split(",");
  return parts[0]?.trim() || "Unknown";
}

export async function importVastai(): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  const db = getDb();

  console.log("[Vast.ai] Fetching GPU offers...");

  // Query for available machines
  const query = JSON.stringify({
    type: "ask",
    limit: 3000,
  });

  const url = `${VASTAI_API}?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Vast.ai API returned ${response.status}: ${response.statusText}`);
  }

  const data: VastResponse = await response.json();
  console.log(`[Vast.ai] Received ${data.offers.length} offers`);

  // Clear existing offers (marketplace is real-time, stale data is misleading)
  db.prepare("DELETE FROM gpu_offers WHERE provider = 'vast.ai'").run();

  const insert = db.prepare(`
    INSERT INTO gpu_offers (id, provider, gpu_model, gpu_count, vram_gb, price_per_hour,
      cpu_cores, ram_gb, disk_gb, disk_type, internet_speed_mbps, region,
      reliability_score, dlperf, verified, updated_at)
    VALUES (@id, 'vast.ai', @gpu_model, @gpu_count, @vram_gb, @price_per_hour,
      @cpu_cores, @ram_gb, @disk_gb, @disk_type, @internet_speed_mbps, @region,
      @reliability_score, @dlperf, @verified, datetime('now'))
  `);

  let count = 0;
  const insertMany = db.transaction((offers: VastOffer[]) => {
    for (const offer of offers) {
      if (!validateOffer(offer)) continue;

      // Filter to inference-relevant GPUs
      const isInferenceGpu = INFERENCE_GPUS.some(
        (gpu) => offer.gpu_name.includes(gpu) || gpu.includes(offer.gpu_name)
      );
      if (!isInferenceGpu) continue;

      try {
        insert.run({
          id: offer.id,
          gpu_model: offer.gpu_name,
          gpu_count: offer.num_gpus,
          vram_gb: Math.round(offer.gpu_ram / 1024 * 10) / 10, // MB -> GB
          price_per_hour: Math.round(offer.dph_total * 10000) / 10000, // 4 decimals
          cpu_cores: offer.cpu_cores,
          ram_gb: Math.round(offer.cpu_ram / 1024 * 10) / 10,
          disk_gb: Math.round(offer.disk_space),
          disk_type: offer.disk_name || null,
          internet_speed_mbps: Math.round(offer.inet_down),
          region: extractRegion(offer.geolocation),
          reliability_score: Math.round(offer.reliability * 1000) / 1000,
          dlperf: Math.round(offer.dlperf * 100) / 100,
          verified: offer.verified ? 1 : 0,
        });
        count++;
      } catch (err) {
        errors.push(`Failed to insert offer ${offer.id}: ${err}`);
      }
    }
  });

  insertMany(data.offers);

  // Log sync
  db.prepare(`
    INSERT INTO sync_log (source, status, records_count, error_message)
    VALUES ('vast.ai', @status, @count, @errors)
  `).run({
    status: errors.length > 0 ? "partial" : "success",
    count,
    errors: errors.length > 0 ? errors.join("; ") : null,
  });

  console.log(`[Vast.ai] Imported ${count} GPU offers (${errors.length} errors)`);
  return { count, errors };
}
