"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---- Types ----
interface ScenarioResult {
  inputs: { tokens_per_day: number; input_ratio: number; quality: string; team_size: number; utilization: number };
  model: { id: string; name: string; provider: string; quality_tier: string; input_price: number; output_price: number };
  gpu: { model: string; price_per_hour: number; region: string; vram_gb: number };
  options: {
    cloud_api: { monthly_cost: number; daily_cost: number; cost_per_1k_tokens: number };
    rented_gpu: { monthly_cost: number; daily_cost: number; raw_monthly: number; utilization_adjusted: number; overhead: number; gpu_count: number };
    owned_hardware: { monthly_cost: number; daily_cost: number; amortized_hw: number; power_colo: number; overhead: number; gpu_count: number };
  };
  recommendation: string;
  savings_vs_max: number;
}

interface GpuOffer {
  id: number; gpu_model: string; vram_gb: number; price_per_hour: number; region: string; reliability_score: number;
}

interface ApiModel {
  id: string; provider: string; model_name: string; input_price_per_mtok: number; output_price_per_mtok: number; quality_tier: string;
}

// ---- Constants ----
const QUALITY_COLORS: Record<string, string> = {
  Frontier: "bg-amber-100 text-amber-800", Strong: "bg-blue-100 text-blue-800",
  Good: "bg-green-50 text-green-700", Budget: "bg-gray-100 text-gray-500",
};

const VRAM_BY_TIER: Record<string, number> = { Frontier: 80, Strong: 40, Good: 16, Budget: 8 };

const OPTION_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
  cloud_api: { label: "Cloud API", color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: "☁️" },
  rented_gpu: { label: "Rented GPU", color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200", icon: "🖥️" },
  owned_hardware: { label: "Owned Hardware", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200", icon: "🏗️" },
};

// ---- Helpers ----
function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Simple lat/lng → country code (covers major GPU regions)
function geoToCountry(lat: number, lng: number): string {
  if (lat > 24 && lat < 50 && lng > -125 && lng < -66) return "US";
  if (lat > 35 && lat < 72 && lng > -10 && lng < 40) {
    if (lng > 5 && lng < 15 && lat > 47) return "DE";
    if (lng > -5 && lng < 3 && lat > 42) return "FR";
    if (lng > -8 && lng < 2 && lat > 50) return "GB";
    if (lng > 11 && lng < 19 && lat > 36) return "IT";
    if (lng > 14 && lng < 25 && lat > 49) return "PL";
    if (lng > 3 && lng < 8 && lat > 50) return "NL";
    if (lng > 8 && lng < 18 && lat > 55) return "SE";
    if (lng > 19 && lng < 30 && lat > 35) return "RO";
    return "DE"; // default EU
  }
  if (lat > 6 && lat < 36 && lng > 68 && lng < 98) return "IN";
  if (lat > 20 && lat < 46 && lng > 100 && lng < 146) return "CN";
  if (lat > 30 && lat < 46 && lng > 129 && lng < 146) return "JP";
  if (lat > 33 && lat < 39 && lng > 125 && lng < 130) return "KR";
  if (lat > 1 && lat < 8 && lng > 100 && lng < 105) return "SG";
  if (lat > -45 && lat < -10 && lng > 112 && lng < 155) return "AU";
  if (lat > 41 && lat < 82 && lng > -141 && lng < -52) return "CA";
  if (lat > 14 && lat < 33 && lng > -118 && lng < -86) return "MX";
  if (lat > -34 && lat < 6 && lng > -74 && lng < -35) return "BR";
  return "US"; // fallback
}

// ---- Geolocation hook ----
function useUserRegion() {
  const [region, setRegion] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined" || !navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setRegion(geoToCountry(pos.coords.latitude, pos.coords.longitude)),
      () => {} // silently fail
    );
  }, []);
  return [region, setRegion] as const;
}

// ---- GPU regions hook (derives from gpuList) ----
function useGpuRegions(gpuList: GpuOffer[]) {
  return [...new Set(gpuList.map((g) => g.region))].filter(Boolean).sort();
}

// ---- GPU selector for quick scenarios ----
function useFilteredGpus(gpuList: GpuOffer[], quality: string, region: string) {
  const minVram = VRAM_BY_TIER[quality] || 16;
  return gpuList
    .filter((g) => g.vram_gb >= minVram)
    .sort((a, b) => {
      const aMatch = a.region === region ? 0 : 1;
      const bMatch = b.region === region ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.price_per_hour - b.price_per_hour;
    });
}

function QuickGpuSelect({
  quality, region, selectedId, onSelect, gpuList,
}: {
  quality: string; region: string; selectedId: number | null;
  onSelect: (g: GpuOffer | null) => void; gpuList: GpuOffer[];
}) {
  const filtered = useFilteredGpus(gpuList, quality, region);
  const top20 = filtered.slice(0, 20);

  // Ensure selectedId is valid within the current options
  const validSelection = top20.find((g) => g.id === selectedId);
  const effectiveId = validSelection ? selectedId : (top20[0]?.id ?? null);

  // Auto-select cheapest when selection becomes invalid
  const lastAutoId = useRef<number | null>(null);
  useEffect(() => {
    if (top20.length === 0) return;
    if (effectiveId !== selectedId && effectiveId !== lastAutoId.current) {
      lastAutoId.current = effectiveId;
      const gpu = top20.find((g) => g.id === effectiveId);
      if (gpu) onSelect(gpu);
    }
  });

  return (
    <select
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
      value={effectiveId ?? ""}
      onChange={(e) => {
        const id = parseInt(e.target.value);
        if (isNaN(id)) return;
        const gpu = top20.find((g) => g.id === id);
        if (gpu) onSelect(gpu);
      }}
    >
      {top20.map((g) => (
        <option key={g.id} value={g.id}>
          {g.gpu_model} — ${g.price_per_hour.toFixed(2)}/hr · {g.vram_gb.toFixed(0)}GB · {g.region}
        </option>
      ))}
    </select>
  );
}

// ---- Quick Scenario Card ----
interface ScenarioConfig {
  icon: string;
  title: string;
  description: string;
  fields: { key: string; label: string; min: number; max: number; step: number; multiplier?: number }[];
  defaults: Record<string, number>;
  defaultQuality: string;
  defaultInputRatio: number;
  defaultTeamSize: number;
  defaultUtilization: number;
}

function QuickScenarioCard({
  config, region, gpuList, onCalculate,
}: {
  config: ScenarioConfig;
  region: string;
  gpuList: GpuOffer[];
  onCalculate: (params: { tokensPerDay: number; quality: string; inputRatio: number; teamSize: number; utilization: number; gpuId: number | null }) => void;
}) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    config.fields.forEach((f) => { init[f.key] = config.defaults[f.key] ?? 0; });
    return init;
  });
  const [quality, setQuality] = useState(config.defaultQuality);
  const [gpuId, setGpuId] = useState<number | null>(null);

  function computeTokens(): number {
    let result = 1;
    for (const f of config.fields) {
      const raw = values[f.key] || 0;
      result *= f.multiplier ? raw * f.multiplier : raw;
    }
    return Math.round(result);
  }

  const tokensPerDay = computeTokens();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{config.icon}</span>
        <h3 className="text-sm font-bold">{config.title}</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">{config.description}</p>

      <div className="space-y-3">
        {config.fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-gray-400 mb-1">{f.label}</label>
            <input
              type="number" min={f.min} max={f.max} step={f.step}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: parseInt(e.target.value) || 0 }))}
            />
          </div>
        ))}

        {/* Model strength */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Model strength</label>
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
            value={quality}
            onChange={(e) => { setQuality(e.target.value); setGpuId(null); }}
          >
            <option value="Frontier">Frontier (most capable)</option>
            <option value="Strong">Strong (recommended)</option>
            <option value="Good">Good (cost-efficient)</option>
            <option value="Budget">Budget (cheapest)</option>
          </select>
        </div>

        {/* GPU */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">GPU ({VRAM_BY_TIER[quality]}GB+ VRAM)</label>
          <QuickGpuSelect
            quality={quality}
            region={region}
            selectedId={gpuId}
            onSelect={(g) => setGpuId(g?.id || null)}
            gpuList={gpuList}
          />
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 my-4">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Estimated AI workload</span>
          <span className="font-semibold font-mono">{formatTokens(tokensPerDay)} tokens/day</span>
        </div>
      </div>

      <button
        onClick={() => onCalculate({
          tokensPerDay,
          quality,
          inputRatio: config.defaultInputRatio,
          teamSize: config.defaultTeamSize,
          utilization: config.defaultUtilization,
          gpuId,
        })}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Calculate costs
      </button>
    </div>
  );
}

// ---- Results Section ----
function ComparisonResults({ result }: { result: ScenarioResult }) {
  return (
    <div className="space-y-6">
      {/* 3-column comparison */}
      <div className="grid grid-cols-3 gap-4">
        {(["cloud_api", "rented_gpu", "owned_hardware"] as const).map((key) => {
          const meta = OPTION_META[key];
          const opt = result.options[key];
          const isWinner = result.recommendation === key;
          return (
            <div key={key} className={`bg-white border rounded-xl p-5 relative transition-all ${isWinner ? `${meta.borderColor} border-2 shadow-sm` : "border-gray-200"}`}>
              {isWinner && (
                <div className={`absolute -top-3 left-4 px-2.5 py-0.5 rounded-full text-xs font-bold ${meta.bgColor} ${meta.color}`}>Best value</div>
              )}
              <div className="flex items-center gap-2 mb-4 mt-1">
                <span className="text-lg">{meta.icon}</span>
                <span className="text-sm font-bold">{meta.label}</span>
              </div>
              <div className={`text-3xl font-bold ${meta.color}`}>{formatCurrency(opt.monthly_cost)}</div>
              <div className="text-xs text-gray-400 mt-1">per month</div>
              <div className="border-t border-gray-100 my-4" />
              <div className="text-sm text-gray-500">{formatCurrency(opt.daily_cost)}/day</div>
              {key === "cloud_api" && (
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  <div>Pay-per-token, no fixed costs</div>
                  <div>Scales instantly up or down</div>
                  <div>Zero ops overhead</div>
                </div>
              )}
              {key === "rented_gpu" && (
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  <div>{result.options.rented_gpu.gpu_count} GPU{result.options.rented_gpu.gpu_count > 1 ? "s" : ""} needed</div>
                  <div>Raw: {formatCurrency(result.options.rented_gpu.raw_monthly)}/mo</div>
                  <div>Util. adj: {formatCurrency(result.options.rented_gpu.utilization_adjusted)}/mo</div>
                  <div>Ops overhead: {formatCurrency(result.options.rented_gpu.overhead)}/mo</div>
                </div>
              )}
              {key === "owned_hardware" && (
                <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                  <div>{result.options.owned_hardware.gpu_count} GPU{result.options.owned_hardware.gpu_count > 1 ? "s" : ""} needed</div>
                  <div>HW: {formatCurrency(result.options.owned_hardware.amortized_hw)}/mo (36mo)</div>
                  <div>Power + colo: {formatCurrency(result.options.owned_hardware.power_colo)}/mo</div>
                  <div>Ops overhead: {formatCurrency(result.options.owned_hardware.overhead)}/mo</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Savings callout */}
      {result.savings_vs_max > 5 && (
        <div className={`p-4 rounded-xl border ${OPTION_META[result.recommendation].bgColor} ${OPTION_META[result.recommendation].borderColor}`}>
          <div className={`text-sm font-semibold ${OPTION_META[result.recommendation].color}`}>
            {OPTION_META[result.recommendation].label} saves ~{result.savings_vs_max.toFixed(0)}% vs the most expensive option
          </div>
        </div>
      )}

      {/* Cost breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Cost Breakdown</h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 mb-4">
          <div>
            <div className="font-semibold text-gray-600 mb-1">Cloud API</div>
            <div>{formatTokens(result.inputs.tokens_per_day * result.inputs.input_ratio)} input/day × ${result.model.input_price}/M</div>
            <div>{formatTokens(result.inputs.tokens_per_day * (1 - result.inputs.input_ratio))} output/day × ${result.model.output_price}/M</div>
            <div className="mt-1 font-medium">= {formatCurrency(result.options.cloud_api.daily_cost)}/day × 30</div>
          </div>
          <div>
            <div className="font-semibold text-gray-600 mb-1">Rented GPU ({result.options.rented_gpu.gpu_count}x)</div>
            <div>${result.gpu.price_per_hour.toFixed(2)}/hr × 24hr × 30d × {result.options.rented_gpu.gpu_count}</div>
            <div>÷ {(result.inputs.utilization * 100).toFixed(0)}% util = {formatCurrency(result.options.rented_gpu.utilization_adjusted)}</div>
            <div>+ {formatCurrency(result.options.rented_gpu.overhead)} ops</div>
          </div>
          <div>
            <div className="font-semibold text-gray-600 mb-1">Owned Hardware ({result.options.owned_hardware.gpu_count}x)</div>
            <div>$30K × {result.options.owned_hardware.gpu_count} ÷ 36mo = {formatCurrency(result.options.owned_hardware.amortized_hw)}/mo</div>
            <div>+ {formatCurrency(result.options.owned_hardware.power_colo)} power/colo</div>
            <div>+ {formatCurrency(result.options.owned_hardware.overhead)} ops</div>
          </div>
        </div>
        <div className="border-t border-gray-100 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Assumptions</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-gray-400">
            <div>GPU utilization: {(result.inputs.utilization * 100).toFixed(0)}%</div>
            <div>Input/output: {(result.inputs.input_ratio * 100).toFixed(0)}/{((1 - result.inputs.input_ratio) * 100).toFixed(0)}</div>
            <div>Engineering overhead: ${result.inputs.team_size * 500}/mo ({result.inputs.team_size} person{result.inputs.team_size > 1 ? "s" : ""})</div>
            <div>Owned HW: $30K H100 amortized over 36 months</div>
            <div>Power + colocation: $0.50/hr (~$360/mo per GPU)</div>
            <div>GPU rental: 24/7 dedicated instance</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Model Selector (for advanced builder) ----
function ModelSelector({ selectedId, onSelect }: { selectedId: string | null; onSelect: (m: ApiModel | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<ApiModel[]>([]);
  const [selected, setSelected] = useState<ApiModel | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = new URLSearchParams({ limit: "30", sort: "input_price_per_mtok", order: "asc" });
    if (search) p.set("search", search);
    fetch(`/api/models?${p}`).then((r) => r.json()).then((d) => setModels(d.models));
  }, [search]);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/models?search=${encodeURIComponent(selectedId)}&limit=1`)
      .then((r) => r.json())
      .then((d) => { if (d.models?.[0]) setSelected(d.models[0]); });
  }, [selectedId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">API Model</div>
        {selected ? (
          <>
            <div className="font-semibold text-sm mt-1">{selected.model_name}</div>
            <div className="text-xs text-gray-400">{selected.provider} · ${selected.input_price_per_mtok}/M in · ${selected.output_price_per_mtok}/M out</div>
          </>
        ) : (
          <div className="text-sm text-gray-400 mt-1">Auto-select cheapest at quality tier</div>
        )}
        <div className="absolute top-4 right-4 text-gray-300 text-xs">{open ? "▲" : "▼"}</div>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" placeholder="Search models..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button onClick={() => { setSelected(null); onSelect(null); setOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 text-gray-400 italic">Auto-select cheapest</button>
            {models.map((m) => (
              <button key={m.id} onClick={() => { setSelected(m); onSelect(m); setOpen(false); setSearch(""); }} className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-50 ${selected?.id === m.id ? "bg-blue-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <div><span className="text-sm font-medium">{m.model_name}</span><span className="text-xs text-gray-400 ml-2">{m.provider}</span></div>
                  <span className={`inline-block px-1.5 py-0 rounded-full text-xs ${QUALITY_COLORS[m.quality_tier] || ""}`}>{m.quality_tier}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">${m.input_price_per_mtok}/M input · ${m.output_price_per_mtok}/M output</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- GPU Selector (for advanced builder) ----
function GpuSelector({ selectedId, onSelect }: { selectedId: number | null; onSelect: (g: GpuOffer | null) => void }) {
  const [open, setOpen] = useState(false);
  const [gpuFilter, setGpuFilter] = useState("");
  const [gpus, setGpus] = useState<GpuOffer[]>([]);
  const [selected, setSelected] = useState<GpuOffer | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = new URLSearchParams({ limit: "30", sort: "price_per_hour", order: "asc" });
    if (gpuFilter) p.set("gpu_model", gpuFilter);
    fetch(`/api/gpus?${p}`).then((r) => r.json()).then((d) => setGpus(d.offers));
  }, [gpuFilter]);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-purple-300 transition-colors">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">GPU Baseline</div>
        {selected ? (
          <>
            <div className="font-semibold text-sm mt-1">{selected.gpu_model}</div>
            <div className="text-xs text-gray-400">${selected.price_per_hour.toFixed(2)}/hr · {selected.vram_gb.toFixed(0)} GB · {selected.region}</div>
          </>
        ) : (
          <div className="text-sm text-gray-400 mt-1">Auto-select cheapest H100</div>
        )}
        <div className="absolute top-4 right-4 text-gray-300 text-xs">{open ? "▲" : "▼"}</div>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex gap-2 flex-wrap">
            {["", "H100", "H200", "A100", "RTX 4090", "L40S"].map((g) => (
              <button key={g} onClick={() => setGpuFilter(g)} className={`px-2 py-1 text-xs rounded-md border ${gpuFilter === g ? "bg-purple-600 text-white border-purple-600" : "border-gray-200 text-gray-500"}`}>{g || "All"}</button>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button onClick={() => { setSelected(null); onSelect(null); setOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 text-gray-400 italic">Auto-select cheapest H100</button>
            {gpus.map((g) => (
              <button key={g.id} onClick={() => { setSelected(g); onSelect(g); setOpen(false); }} className={`w-full text-left px-4 py-2.5 hover:bg-purple-50 border-b border-gray-50 ${selected?.id === g.id ? "bg-purple-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{g.gpu_model}</span>
                  <span className="text-sm font-mono font-semibold">${g.price_per_hour.toFixed(2)}/hr</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{g.vram_gb.toFixed(0)} GB · {g.region} · {(g.reliability_score * 100).toFixed(0)}% reliability</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Scenario configs ----
const SCENARIOS: ScenarioConfig[] = [
  {
    icon: "💬", title: "Customer Support Chatbot",
    description: "AI-powered support handling customer inquiries around the clock",
    fields: [
      { key: "conversations", label: "Customer conversations / day", min: 100, max: 100000, step: 100 },
      { key: "replies", label: "Avg replies per conversation", min: 1, max: 50, step: 1, multiplier: 150 },
    ],
    defaults: { conversations: 2000, replies: 20 },
    defaultQuality: "Strong", defaultInputRatio: 0.65, defaultTeamSize: 3, defaultUtilization: 0.6,
  },
  {
    icon: "🔍", title: "Internal Knowledge Base",
    description: "AI search over company docs, policies, and training materials",
    fields: [
      { key: "employees", label: "Employees using it", min: 10, max: 10000, step: 10 },
      { key: "searches", label: "Searches per employee / day", min: 1, max: 20, step: 1, multiplier: 6000 },
    ],
    defaults: { employees: 250, searches: 5 },
    defaultQuality: "Strong", defaultInputRatio: 0.75, defaultTeamSize: 2, defaultUtilization: 0.5,
  },
  {
    icon: "📄", title: "Document Analysis",
    description: "Contract review, compliance checks, and legal document processing",
    fields: [
      { key: "documents", label: "Documents reviewed / day", min: 10, max: 5000, step: 10 },
      { key: "pages", label: "Avg pages per document", min: 1, max: 200, step: 1, multiplier: 500 },
    ],
    defaults: { documents: 200, pages: 30 },
    defaultQuality: "Frontier", defaultInputRatio: 0.75, defaultTeamSize: 4, defaultUtilization: 0.4,
  },
];

// ---- Main Page ----
export default function HomePage() {
  const [userRegion, setUserRegion] = useUserRegion();
  const [gpuList, setGpuList] = useState<GpuOffer[]>([]);
  const gpuRegions = useGpuRegions(gpuList);

  // Shared results from quick scenarios
  const [quickResult, setQuickResult] = useState<ScenarioResult | null>(null);

  // Advanced builder state
  const [tokensPerDay, setTokensPerDay] = useState("10000000");
  const [inputRatio, setInputRatio] = useState(60);
  const [quality, setQuality] = useState("Strong");
  const [latency, setLatency] = useState("batch");
  const [teamSize, setTeamSize] = useState("1");
  const [utilization, setUtilization] = useState(70);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedGpuId, setSelectedGpuId] = useState<number | null>(null);
  const [advancedResult, setAdvancedResult] = useState<ScenarioResult | null>(null);

  // Fetch full GPU list for quick scenario dropdowns (need high-VRAM GPUs too)
  useEffect(() => {
    fetch("/api/gpus?limit=100&sort=price_per_hour&order=asc")
      .then((r) => r.json())
      .then((d) => {
        const offers = d.offers as GpuOffer[];
        // If we don't have enough high-VRAM GPUs, fetch those separately
        const has80gb = offers.some((g) => g.vram_gb >= 80);
        if (!has80gb) {
          fetch("/api/gpus?limit=50&min_vram=40&sort=price_per_hour&order=asc")
            .then((r) => r.json())
            .then((d2) => {
              const combined = [...offers];
              for (const g of d2.offers as GpuOffer[]) {
                if (!combined.find((c) => c.id === g.id)) combined.push(g);
              }
              setGpuList(combined);
            });
        } else {
          setGpuList(offers);
        }
      });
  }, []);

  // Quick scenario calculate
  function handleQuickCalculate(params: { tokensPerDay: number; quality: string; inputRatio: number; teamSize: number; utilization: number; gpuId: number | null }) {
    if (params.tokensPerDay <= 0) return;
    const p = new URLSearchParams({
      tokens: String(params.tokensPerDay),
      inputRatio: String(params.inputRatio),
      quality: params.quality,
      teamSize: String(params.teamSize),
      utilization: String(params.utilization),
    });
    if (params.gpuId !== null && !isNaN(params.gpuId)) p.set("gpuId", String(params.gpuId));

    fetch(`/api/scenario?${p}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setQuickResult(data);
        // Results section updates in place, no scroll
      })
      .catch(() => {});
  }

  // Advanced builder fetch
  const fetchAdvanced = useCallback(() => {
    const tokens = parseInt(tokensPerDay.replace(/,/g, "")) || 0;
    if (tokens <= 0) return;
    const p = new URLSearchParams({
      tokens: String(tokens),
      inputRatio: String(inputRatio / 100),
      quality, teamSize,
      utilization: String(utilization / 100),
    });
    if (selectedModelId) p.set("modelId", selectedModelId);
    if (selectedGpuId !== null) p.set("gpuId", String(selectedGpuId));

    fetch(`/api/scenario?${p}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setAdvancedResult);
  }, [tokensPerDay, inputRatio, quality, teamSize, utilization, selectedModelId, selectedGpuId]);

  useEffect(() => {
    const timer = setTimeout(fetchAdvanced, 300);
    return () => clearTimeout(timer);
  }, [fetchAdvanced]);

  const PRESETS = [
    { label: "1M", value: 1_000_000 },
    { label: "10M", value: 10_000_000 },
    { label: "100M", value: 100_000_000 },
    { label: "1B", value: 1_000_000_000 },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="text-xl font-bold tracking-tight">Inference<span className="text-blue-600">IQ</span></div>
        <p className="text-sm text-gray-400">LLM Cost Intelligence</p>
        {/* Location selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Location:</span>
          <select
            className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white"
            value={userRegion}
            onChange={(e) => setUserRegion(e.target.value)}
          >
            <option value="">Auto-detect</option>
            {gpuRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Quick Scenarios */}
      <div className="max-w-7xl mx-auto px-8 pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">What are you building?</h1>
          <p className="text-sm text-gray-400 mt-1">Pick a scenario, adjust the numbers, and see what it would cost</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {SCENARIOS.map((s) => (
            <QuickScenarioCard
              key={s.title}
              config={s}
              region={userRegion}
              gpuList={gpuList}
              onCalculate={handleQuickCalculate}
            />
          ))}
        </div>
      </div>

      {/* Shared Results */}
      {quickResult && (
        <div id="results" className="max-w-7xl mx-auto px-8 py-8">
          <div className="border-t border-gray-200 pt-8 mb-6">
            <h2 className="text-lg font-bold">Cost Comparison</h2>
            <p className="text-sm text-gray-400 mt-1">
              Using {quickResult.model.name} ({quickResult.model.quality_tier}) vs {quickResult.gpu.model} in {quickResult.gpu.region}
            </p>
          </div>
          <ComparisonResults result={quickResult} />
        </div>
      )}

      {/* Advanced Scenario Builder */}
      <div className="max-w-7xl mx-auto px-8 pb-8">
        <div className="border-t border-gray-200 pt-8 mb-6">
          <h2 className="text-lg font-bold">Advanced Scenario Builder</h2>
          <p className="text-sm text-gray-400 mt-1">Fine-tune every parameter for a custom analysis</p>
        </div>

        <div className="grid gap-8" style={{ gridTemplateColumns: "340px 1fr" }}>
          {/* Input Panel */}
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-bold uppercase tracking-wide mb-5">Workload Profile</h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Tokens per day</label>
                  <input className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={tokensPerDay} onChange={(e) => setTokensPerDay(e.target.value.replace(/[^0-9]/g, ""))} />
                  <div className="flex gap-2 mt-2">
                    {PRESETS.map((p) => (
                      <button key={p.label} onClick={() => setTokensPerDay(String(p.value))} className={`px-3 py-1 text-xs rounded-md border transition-colors ${tokensPerDay === String(p.value) ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-500 hover:border-blue-300"}`}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Input / Output ratio: {inputRatio}% / {100 - inputRatio}%</label>
                  <input type="range" min="10" max="90" step="5" value={inputRatio} onChange={(e) => setInputRatio(parseInt(e.target.value))} className="w-full accent-blue-600" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Min. quality tier</label>
                  <select className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={quality} onChange={(e) => setQuality(e.target.value)}>
                    <option value="Frontier">Frontier</option>
                    <option value="Strong">Strong (recommended)</option>
                    <option value="Good">Good</option>
                    <option value="Budget">Budget</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Latency requirement</label>
                  <select className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={latency} onChange={(e) => setLatency(e.target.value)}>
                    <option value="interactive">Interactive (&lt;500ms)</option>
                    <option value="batch">Batch (&lt;2s)</option>
                    <option value="none">No requirement</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-bold uppercase tracking-wide mb-5">Infrastructure</h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Team size (ops overhead)</label>
                  <input type="number" min="1" max="50" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} />
                  <div className="text-xs text-gray-300 mt-1">Engineering overhead: ${parseInt(teamSize || "1") * 500}/mo per person</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">GPU utilization rate: {utilization}%</label>
                  <input type="range" min="10" max="100" step="5" value={utilization} onChange={(e) => setUtilization(parseInt(e.target.value))} className="w-full accent-blue-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Results */}
          <div className="space-y-6 min-w-0">
            <div className="grid grid-cols-2 gap-4">
              <ModelSelector selectedId={selectedModelId} onSelect={(m) => setSelectedModelId(m?.id || null)} />
              <GpuSelector selectedId={selectedGpuId} onSelect={(g) => setSelectedGpuId(g?.id || null)} />
            </div>
            {advancedResult && <ComparisonResults result={advancedResult} />}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-8 py-4 flex justify-between text-xs text-gray-400">
        <span>Data sources: OpenRouter API · Vast.ai Marketplace</span>
        <span>InferenceIQ</span>
      </footer>
    </div>
  );
}
