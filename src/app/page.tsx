"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = "api" | "gpu";
type QualityTier = "Frontier" | "Strong" | "Good" | "Budget";

interface ApiModel {
  id: string;
  provider: string;
  model_name: string;
  context_length: number;
  input_price_per_mtok: number;
  output_price_per_mtok: number;
  quality_tier: QualityTier;
}

interface GpuOffer {
  id: number;
  provider: string;
  gpu_model: string;
  gpu_count: number;
  vram_gb: number;
  price_per_hour: number;
  region: string;
  reliability_score: number;
  dlperf: number;
  verified: number;
}

interface Stats {
  api_models: { count: number; providers: number; cheapest_input: number; cheapest_model: string };
  gpu_offers: { count: number; gpu_models: number; cheapest_h100_price: number; cheapest_h100_region: string; cheapest_h100_reliability: number };
  last_syncs: Record<string, string>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const QUALITY_COLORS: Record<string, string> = {
  Frontier: "bg-amber-100 text-amber-800",
  Strong: "bg-blue-100 text-blue-800",
  Good: "bg-green-50 text-green-700",
  Budget: "bg-gray-100 text-gray-500",
};

function formatPrice(price: number | null, decimals = 2): string {
  if (price === null || price === undefined) return "—";
  return `$${price.toFixed(decimals)}`;
}

function formatCtx(ctx: number | null): string {
  if (!ctx) return "—";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  return `${(ctx / 1000).toFixed(0)}K`;
}

function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr + "Z").getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("api");
  const [stats, setStats] = useState<Stats | null>(null);

  // API models state
  const [models, setModels] = useState<ApiModel[]>([]);
  const [modelPagination, setModelPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, pages: 0 });
  const [modelSearch, setModelSearch] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [modelQuality, setModelQuality] = useState("");
  const [modelSort, setModelSort] = useState("input_price_per_mtok");
  const [modelOrder, setModelOrder] = useState<"asc" | "desc">("asc");

  // GPU offers state
  const [gpus, setGpus] = useState<GpuOffer[]>([]);
  const [gpuPagination, setGpuPagination] = useState<Pagination>({ page: 1, limit: 15, total: 0, pages: 0 });
  const [gpuModel, setGpuModel] = useState("");
  const [gpuSort, setGpuSort] = useState("price_per_hour");
  const [gpuOrder, setGpuOrder] = useState<"asc" | "desc">("asc");

  // Row selection
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedGpuId, setSelectedGpuId] = useState<number | null>(null);

  // Breakeven calculator
  const [tokensPerDay, setTokensPerDay] = useState("10000000");
  const [calcQuality, setCalcQuality] = useState("Strong");
  const [breakeven, setBreakeven] = useState<{
    api: { model: string; provider: string; quality_tier: string; cost_per_day: number };
    gpu: { model: string; price_per_hour: number; region: string; cost_per_day: number };
    comparison: { savings_percent: number; savings_per_day: number; savings_per_month: number; breakeven_tokens_per_day: number; recommendation: string };
  } | null>(null);

  // Fetch stats
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats);
  }, []);

  // Fetch models
  const fetchModels = useCallback(() => {
    const p = new URLSearchParams({
      page: String(modelPagination.page),
      limit: String(modelPagination.limit),
      sort: modelSort,
      order: modelOrder,
    });
    if (modelSearch) p.set("search", modelSearch);
    if (modelProvider) p.set("provider", modelProvider);
    if (modelQuality) p.set("quality", modelQuality);

    fetch(`/api/models?${p}`).then((r) => r.json()).then((data) => {
      setModels(data.models);
      setModelPagination(data.pagination);
    });
  }, [modelPagination.page, modelPagination.limit, modelSearch, modelProvider, modelQuality, modelSort, modelOrder]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  // Fetch GPUs
  const fetchGpus = useCallback(() => {
    const p = new URLSearchParams({
      page: String(gpuPagination.page),
      limit: String(gpuPagination.limit),
      sort: gpuSort,
      order: gpuOrder,
    });
    if (gpuModel) p.set("gpu_model", gpuModel);

    fetch(`/api/gpus?${p}`).then((r) => r.json()).then((data) => {
      setGpus(data.offers);
      setGpuPagination(data.pagination);
    });
  }, [gpuPagination.page, gpuPagination.limit, gpuModel, gpuSort, gpuOrder]);

  useEffect(() => { fetchGpus(); }, [fetchGpus]);

  // Sort handler
  function toggleModelSort(col: string) {
    if (modelSort === col) {
      setModelOrder(modelOrder === "asc" ? "desc" : "asc");
    } else {
      setModelSort(col);
      setModelOrder("asc");
    }
    setModelPagination((p) => ({ ...p, page: 1 }));
  }

  function toggleGpuSort(col: string) {
    if (gpuSort === col) {
      setGpuOrder(gpuOrder === "asc" ? "desc" : "asc");
    } else {
      setGpuSort(col);
      setGpuOrder("asc");
    }
    setGpuPagination((p) => ({ ...p, page: 1 }));
  }

  const sortArrow = (col: string, currentSort: string, currentOrder: string) =>
    currentSort === col ? (currentOrder === "asc" ? " ▲" : " ▼") : "";

  // Fetch breakeven data
  useEffect(() => {
    const tokens = parseInt(tokensPerDay.replace(/,/g, "")) || 0;
    if (tokens <= 0) return;
    const p = new URLSearchParams({ quality: calcQuality, tokens: String(tokens) });
    if (selectedModelId) p.set("modelId", selectedModelId);
    if (selectedGpuId !== null) p.set("gpuId", String(selectedGpuId));
    fetch(`/api/breakeven?${p}`).then((r) => r.ok ? r.json() : null).then(setBreakeven);
  }, [tokensPerDay, calcQuality, selectedModelId, selectedGpuId]);

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="text-xl font-bold tracking-tight">
          Inference<span className="text-blue-600">IQ</span>
        </div>
        <div className="flex gap-0">
          <button
            onClick={() => setTab("api")}
            className={`px-5 py-2 text-sm font-medium border ${tab === "api" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"} rounded-l-lg`}
          >
            API Pricing
          </button>
          <button
            onClick={() => setTab("gpu")}
            className={`px-5 py-2 text-sm font-medium border-t border-b border-r ${tab === "gpu" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200"} rounded-r-lg`}
          >
            GPU Offers
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Synced {timeAgo(stats?.last_syncs?.openrouter || stats?.last_syncs?.["vast.ai"])}
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 px-8 py-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">API Models</div>
          <div className="text-3xl font-bold mt-1">{stats?.api_models.count ?? "—"}</div>
          <div className="text-xs text-gray-400 mt-1">across {stats?.api_models.providers ?? "—"} providers</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">GPU Offers</div>
          <div className="text-3xl font-bold mt-1">{stats?.gpu_offers.count ?? "—"}</div>
          <div className="text-xs text-gray-400 mt-1">from Vast.ai marketplace</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cheapest API / 1M tokens</div>
          <div className="text-3xl font-bold mt-1 text-green-600">{formatPrice(stats?.api_models.cheapest_input ?? null)}</div>
          <div className="text-xs text-gray-400 mt-1">{stats?.api_models.cheapest_model ?? "—"} (input)</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cheapest H100 / hr</div>
          <div className="text-3xl font-bold mt-1 text-purple-600">{formatPrice(stats?.gpu_offers.cheapest_h100_price ?? null)}</div>
          <div className="text-xs text-gray-400 mt-1">Vast.ai · {stats?.gpu_offers.cheapest_h100_region ?? "—"}</div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 px-8 pb-8" style={{ gridTemplateColumns: "1fr 380px" }}>
        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {tab === "api" ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                <input
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 w-56"
                  placeholder="Search models..."
                  value={modelSearch}
                  onChange={(e) => { setModelSearch(e.target.value); setModelPagination((p) => ({ ...p, page: 1 })); }}
                />
                <select
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600"
                  value={modelProvider}
                  onChange={(e) => { setModelProvider(e.target.value); setModelPagination((p) => ({ ...p, page: 1 })); }}
                >
                  <option value="">All Providers</option>
                  {["openai", "anthropic", "google", "meta-llama", "deepseek", "mistralai", "qwen", "cohere"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600"
                  value={modelQuality}
                  onChange={(e) => { setModelQuality(e.target.value); setModelPagination((p) => ({ ...p, page: 1 })); }}
                >
                  <option value="">All Quality</option>
                  <option value="Frontier">Frontier</option>
                  <option value="Strong">Strong</option>
                  <option value="Good">Good</option>
                  <option value="Budget">Budget</option>
                </select>
              </div>
              {/* Table */}
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Model</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer" onClick={() => toggleModelSort("input_price_per_mtok")}>
                      Input / 1M{sortArrow("input_price_per_mtok", modelSort, modelOrder)}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer" onClick={() => toggleModelSort("output_price_per_mtok")}>
                      Output / 1M{sortArrow("output_price_per_mtok", modelSort, modelOrder)}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Quality</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer" onClick={() => toggleModelSort("context_length")}>
                      Context{sortArrow("context_length", modelSort, modelOrder)}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedModelId(selectedModelId === m.id ? null : m.id)}
                      className={`border-t border-gray-50 cursor-pointer transition-colors ${selectedModelId === m.id ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-sm">{m.model_name}</div>
                        <div className="text-xs text-gray-400">{m.id}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`font-mono text-sm ${m.input_price_per_mtok < 0.2 ? "text-green-600 font-semibold" : ""}`}>
                          {formatPrice(m.input_price_per_mtok)}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-sm">{formatPrice(m.output_price_per_mtok)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${QUALITY_COLORS[m.quality_tier] || ""}`}>
                          {m.quality_tier}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{formatCtx(m.context_length)}</td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                          {m.provider}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-400">
                <span>Showing {(modelPagination.page - 1) * modelPagination.limit + 1}–{Math.min(modelPagination.page * modelPagination.limit, modelPagination.total)} of {modelPagination.total} models</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(modelPagination.pages, 7) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setModelPagination((prev) => ({ ...prev, page: p }))}
                      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm ${p === modelPagination.page ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600"}`}
                    >
                      {p}
                    </button>
                  ))}
                  {modelPagination.pages > 7 && (
                    <>
                      <span className="px-1 text-gray-300">…</span>
                      <button
                        onClick={() => setModelPagination((prev) => ({ ...prev, page: modelPagination.pages }))}
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-sm text-gray-600"
                      >
                        {modelPagination.pages}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* GPU Toolbar */}
              <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                <select
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600"
                  value={gpuModel}
                  onChange={(e) => { setGpuModel(e.target.value); setGpuPagination((p) => ({ ...p, page: 1 })); }}
                >
                  <option value="">All GPUs</option>
                  {["H100", "H200", "B200", "A100", "RTX 4090", "RTX 5090", "RTX 3090", "L40S", "RTX A6000"].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              {/* GPU Table */}
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">GPU</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">VRAM</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer" onClick={() => toggleGpuSort("price_per_hour")}>
                      $/hr{sortArrow("price_per_hour", gpuSort, gpuOrder)}
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Provider</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Region</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer" onClick={() => toggleGpuSort("reliability_score")}>
                      Reliability{sortArrow("reliability_score", gpuSort, gpuOrder)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gpus.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedGpuId(selectedGpuId === g.id ? null : g.id)}
                      className={`border-t border-gray-50 cursor-pointer transition-colors ${selectedGpuId === g.id ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-semibold text-sm">{g.gpu_model}</div>
                        <div className="text-xs text-gray-400">{g.gpu_count > 1 ? `${g.gpu_count}x` : ""}</div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{g.vram_gb.toFixed(0)} GB</td>
                      <td className="px-5 py-3">
                        <span className={`font-mono text-sm ${g.price_per_hour < 0.3 ? "text-green-600 font-semibold" : ""}`}>
                          {formatPrice(g.price_per_hour, 2)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-600">
                          {g.provider}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{g.region}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{(g.reliability_score * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* GPU Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-400">
                <span>Showing {(gpuPagination.page - 1) * gpuPagination.limit + 1}–{Math.min(gpuPagination.page * gpuPagination.limit, gpuPagination.total)} of {gpuPagination.total} offers</span>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(gpuPagination.pages, 7) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setGpuPagination((prev) => ({ ...prev, page: p }))}
                      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm ${p === gpuPagination.page ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-600"}`}
                    >
                      {p}
                    </button>
                  ))}
                  {gpuPagination.pages > 7 && (
                    <>
                      <span className="px-1 text-gray-300">…</span>
                      <button
                        onClick={() => setGpuPagination((prev) => ({ ...prev, page: gpuPagination.pages }))}
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-sm text-gray-600"
                      >
                        {gpuPagination.pages}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sidebar — Breakeven Calculator */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold uppercase tracking-wide">Breakeven Calculator</h3>
              {(selectedModelId || selectedGpuId !== null) && (
                <button
                  onClick={() => { setSelectedModelId(null); setSelectedGpuId(null); }}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear selection
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tokens per day</label>
                <input
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={tokensPerDay}
                  onChange={(e) => setTokensPerDay(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Min. quality</label>
                <select
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  value={calcQuality}
                  onChange={(e) => setCalcQuality(e.target.value)}
                >
                  <option value="Strong">Strong (recommended)</option>
                  <option value="Frontier">Frontier</option>
                  <option value="Good">Good</option>
                  <option value="Budget">Budget</option>
                </select>
              </div>
            </div>

            <div className="border-t border-gray-100 my-5" />

            {breakeven ? (
              <>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-400">API cost</div>
                      <div className="text-xs text-gray-300">{breakeven.api.model} ({breakeven.api.quality_tier})</div>
                    </div>
                    <div className="text-base font-bold font-mono text-blue-600">
                      ${breakeven.api.cost_per_day.toFixed(0)}/day
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-400">Self-host cost</div>
                      <div className="text-xs text-gray-300">{breakeven.gpu.model} on Vast.ai · {breakeven.gpu.region}</div>
                    </div>
                    <div className="text-base font-bold font-mono text-purple-600">
                      ${breakeven.gpu.cost_per_day.toFixed(2)}/day
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 my-5" />

                <div className="text-xs text-gray-400">Breakeven point</div>
                <div className="text-2xl font-bold">
                  {breakeven.comparison.recommendation === "self-host"
                    ? `${(breakeven.comparison.breakeven_tokens_per_day / 1_000_000).toFixed(1)}M tokens/day`
                    : "API is cheaper"}
                </div>

                {breakeven.comparison.recommendation === "self-host" ? (
                  <div className="mt-3 p-3.5 bg-green-50 border border-green-200 rounded-xl">
                    <div className="text-sm font-semibold text-green-600">Self-hosting saves ~{breakeven.comparison.savings_percent.toFixed(0)}%</div>
                    <div className="text-xs text-gray-500 mt-1">
                      At your volume, GPU rental saves ${breakeven.comparison.savings_per_day.toFixed(0)}/day (${breakeven.comparison.savings_per_month.toFixed(0)}/mo)
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-sm font-semibold text-blue-600">API is more cost-effective</div>
                    <div className="text-xs text-gray-500 mt-1">At this volume, stick with API pricing</div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-300 text-center py-4">Loading...</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-8 py-4 flex justify-between text-xs text-gray-400">
        <span>Data sources: OpenRouter API · Vast.ai Marketplace</span>
        <span>Last sync: {stats?.last_syncs?.openrouter ? new Date(stats.last_syncs.openrouter + "Z").toLocaleString() : "—"}</span>
      </footer>
    </div>
  );
}
