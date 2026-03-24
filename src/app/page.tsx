"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

// ---- Types ----
interface AnalysisResult {
  industry: string;
  template_id: string;
  current_product: string | null;
  current_price_per_seat: number | null;
  team_size: number;
  current_monthly_spend: number | null;
  workload_params: Record<string, number>;
  quality_needed: string;
  summary: string;
  tokens_per_day: number;
  template: {
    id: string; name: string; quality: string; inputRatio: number;
    teamOverhead: number; utilization: number;
    competitors: { name: string; price_per_seat: number; description: string }[];
  } | null;
}

interface ScenarioResult {
  inputs: { tokens_per_day: number; input_ratio: number; quality: string; team_size: number; utilization: number };
  current: { product: string; monthly_spend: number } | null;
  savings_vs_current: number | null;
  model: { id: string; name: string; provider: string; quality_tier: string; input_price: number; output_price: number };
  gpu: { model: string; price_per_hour: number; region: string; vram_gb: number };
  options: {
    cloud_api: { monthly_cost: number; daily_cost: number; cost_per_1k_tokens: number };
    rented_gpu: { monthly_cost: number; daily_cost: number; raw_monthly: number; utilization_adjusted: number; overhead: number; gpu_count: number };
    owned_hardware: { monthly_cost: number; daily_cost: number; amortized_hw: number; per_gpu_monthly: number; per_gpu_price: number; upfront_cost: number; amortization_months: number; power_colo: number; overhead: number; gpu_count: number };
  };
  recommendation: string;
  savings_vs_max: number;
}

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

const INDUSTRIES = [
  { id: "legal", name: "Legal", icon: "⚖️" },
  { id: "support", name: "Customer Support", icon: "💬" },
  { id: "healthcare", name: "Healthcare", icon: "🏥" },
  { id: "finance", name: "Finance", icon: "📊" },
];

// ---- Auth Modal ----
function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAuthError("");
    const err = mode === "register"
      ? await register(email, password, name)
      : await login(email, password);
    if (err) { setAuthError(err); setSubmitting(false); }
    else onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-1">{mode === "register" ? "Create your account" : "Welcome back"}</h2>
        <p className="text-sm text-gray-400 mb-6">{mode === "register" ? "Save analyses and track your AI spend over time" : "Sign in to access your saved data"}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Your name</label>
              <input className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={name} onChange={(e) => setName(e.target.value)} placeholder="James Hartwell" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input type="email" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="james@hartwell.com" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
            <input type="password" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} />
          </div>

          {authError && <div className="text-sm text-red-500">{authError}</div>}

          <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {submitting ? "..." : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="text-center mt-4 text-sm text-gray-400">
          {mode === "register" ? (
            <>Already have an account? <button onClick={() => setMode("login")} className="text-blue-600 font-medium">Sign in</button></>
          ) : (
            <>New here? <button onClick={() => setMode("register")} className="text-blue-600 font-medium">Create account</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function HomePage() {
  const { user, firm, loading: authLoading, logout, saveFirm } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // AI Intake state
  const [description, setDescription] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState<{ id: number; name: string; created_at: string }[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Pre-fill from firm profile
  useEffect(() => {
    if (firm?.ai_description && !description) {
      setDescription(firm.ai_description);
      if (firm.industry) setSelectedIndustry(firm.industry);
    }
  }, [firm]);

  // Load saved scenarios
  useEffect(() => {
    if (user && firm) {
      fetch("/api/scenarios").then((r) => r.json()).then((d) => setSavedScenarios(d.scenarios || [])).catch(() => {});
    }
  }, [user, firm]);

  // Advanced builder state
  const [advTokens, setAdvTokens] = useState("10000000");
  const [advInputRatio, setAdvInputRatio] = useState(60);
  const [advQuality, setAdvQuality] = useState("Strong");
  const [advTeamSize, setAdvTeamSize] = useState("1");
  const [advUtilization, setAdvUtilization] = useState(70);
  const [advResult, setAdvResult] = useState<ScenarioResult | null>(null);

  const PRESETS = [
    { label: "1M", value: 1_000_000 },
    { label: "10M", value: 10_000_000 },
    { label: "100M", value: 100_000_000 },
    { label: "1B", value: 1_000_000_000 },
  ];

  // Step 1: Analyze user description
  async function handleAnalyze() {
    if (description.trim().length < 10) { setError("Please describe your setup in more detail"); return; }
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, industry: selectedIndustry || undefined }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Analysis failed"); }
      const data: AnalysisResult = await res.json();
      setAnalysis(data);

      // Auto-fetch scenario with analyzed params
      const p = new URLSearchParams({
        tokens: String(data.tokens_per_day),
        inputRatio: String(data.template?.inputRatio ?? 0.7),
        quality: data.quality_needed || data.template?.quality || "Strong",
        teamSize: String(data.template?.teamOverhead ?? 2),
        utilization: String(data.template?.utilization ?? 0.6),
      });
      if (data.current_monthly_spend) p.set("currentSpend", String(data.current_monthly_spend));
      if (data.current_product) p.set("currentProduct", data.current_product);

      const scenRes = await fetch(`/api/scenario?${p}`);
      if (scenRes.ok) setScenario(await scenRes.json());

      // Auto-save firm profile if logged in
      if (user) {
        saveFirm({
          name: firm?.name || "My Company",
          industry: data.industry,
          team_size: data.team_size,
          current_product: data.current_product || undefined,
          current_price_per_seat: data.current_price_per_seat || undefined,
          current_monthly_spend: data.current_monthly_spend || undefined,
          ai_description: description,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAnalyzing(false);
    }
  }

  // Advanced builder fetch
  const fetchAdvanced = useCallback(() => {
    const tokens = parseInt(advTokens.replace(/,/g, "")) || 0;
    if (tokens <= 0) return;
    const p = new URLSearchParams({
      tokens: String(tokens), inputRatio: String(advInputRatio / 100),
      quality: advQuality, teamSize: advTeamSize, utilization: String(advUtilization / 100),
    });
    fetch(`/api/scenario?${p}`).then((r) => r.ok ? r.json() : null).then(setAdvResult).catch(() => {});
  }, [advTokens, advInputRatio, advQuality, advTeamSize, advUtilization]);

  useEffect(() => {
    const timer = setTimeout(fetchAdvanced, 400);
    return () => clearTimeout(timer);
  }, [fetchAdvanced]);

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="text-xl font-bold tracking-tight">Reasons<span className="text-blue-600">IQ</span></div>
        {firm ? (
          <p className="text-sm text-gray-600 font-medium">{firm.name}</p>
        ) : (
          <p className="text-sm text-gray-400">AI Spend Optimization</p>
        )}
        <div>
          {authLoading ? null : user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{user.name || user.email}</span>
              <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">Sign out</button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} className="px-4 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Hero — AI Intake */}
      <div className="max-w-4xl mx-auto px-8 pt-12 pb-8">
        <h1 className="text-3xl font-bold text-center mb-2">Are you overpaying for AI?</h1>
        <p className="text-center text-gray-400 mb-8">
          Describe your current setup and we&apos;ll show you how much you could save
        </p>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <textarea
            className="w-full px-4 py-4 border border-gray-200 rounded-xl text-sm bg-gray-50 resize-none focus:outline-none focus:border-blue-400 transition-colors"
            rows={4}
            placeholder={`e.g., "We're a 100-person law firm spending $3,000/month on Microsoft Copilot. We review about 200 contracts per week and want to explore better AI options for document analysis..."`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex items-center gap-4 mt-4">
            <div className="flex gap-2">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => setSelectedIndustry(selectedIndustry === ind.id ? "" : ind.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    selectedIndustry === ind.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 text-gray-500 hover:border-blue-300"
                  }`}
                >
                  {ind.icon} {ind.name}
                </button>
              ))}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={analyzing || description.trim().length < 10}
              className="ml-auto px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? "Analyzing..." : "Analyze my setup"}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-500">{error}</div>
          )}
        </div>
      </div>

      {/* Results — AI-Generated Scenario */}
      {analysis && scenario && (
        <div className="max-w-7xl mx-auto px-8 pb-8">
          {/* Summary */}
          <div className="mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">AI Analysis</div>
                  <div className="text-sm text-gray-600">{analysis.summary}</div>
                  <div className="flex gap-4 mt-3 text-xs text-gray-400">
                    {analysis.current_product && (
                      <span>Current: <span className="font-semibold text-gray-600">{analysis.current_product}</span></span>
                    )}
                    {analysis.current_monthly_spend && (
                      <span>Spend: <span className="font-semibold text-gray-600">{formatCurrency(analysis.current_monthly_spend)}/mo</span></span>
                    )}
                    <span>Team: <span className="font-semibold text-gray-600">{analysis.team_size} people</span></span>
                    <span>Workload: <span className="font-semibold text-gray-600">{formatTokens(analysis.tokens_per_day)} tokens/day</span></span>
                  </div>
                </div>
                {analysis.template && (
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600">
                      {INDUSTRIES.find((i) => i.id === analysis.industry)?.icon} {analysis.template.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3-Column Comparison: Keep Current vs Switch to API vs Build Custom */}
          <div className="grid grid-cols-3 gap-5 mb-6">
            {/* Column 1: Keep Current */}
            <div className={`bg-white border rounded-xl p-5 relative ${
              scenario.current && scenario.current.monthly_spend <= scenario.options.cloud_api.monthly_cost
                ? "border-gray-300 border-2" : "border-gray-200"
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📌</span>
                <span className="text-sm font-bold">Keep Current</span>
              </div>
              {scenario.current ? (
                <>
                  <div className="text-3xl font-bold text-gray-600">{formatCurrency(scenario.current.monthly_spend)}</div>
                  <div className="text-xs text-gray-400 mt-1">per month · {scenario.current.product}</div>
                  <div className="border-t border-gray-100 my-4" />
                  <div className="space-y-1.5 text-xs text-gray-400">
                    <div>No migration effort</div>
                    <div>Vendor-managed, turnkey</div>
                    <div>Limited customization</div>
                    {analysis.template?.competitors && (
                      <div className="border-t border-gray-100 pt-2 mt-2">
                        <div className="font-semibold text-gray-500 mb-1">Alternatives in this space:</div>
                        {analysis.template.competitors.map((c) => (
                          <div key={c.name} className="flex justify-between">
                            <span>{c.name}</span>
                            <span className="font-mono">${c.price_per_seat}/seat</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-gray-400">—</div>
                  <div className="text-xs text-gray-400 mt-1">No current AI spend detected</div>
                  <div className="border-t border-gray-100 my-4" />
                  {analysis.template?.competitors && (
                    <div className="space-y-1.5 text-xs text-gray-400">
                      <div className="font-semibold text-gray-500 mb-1">Off-the-shelf options:</div>
                      {analysis.template.competitors.map((c) => (
                        <div key={c.name} className="flex justify-between">
                          <span>{c.name}</span>
                          <span className="font-mono">${c.price_per_seat}/seat</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Column 2: Switch to API */}
            {(() => {
              const api = scenario.options.cloud_api;
              const isBest = scenario.recommendation === "cloud_api";
              return (
                <div className={`bg-white border rounded-xl p-5 relative ${isBest ? "border-blue-200 border-2 shadow-sm" : "border-gray-200"}`}>
                  {isBest && <div className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">Best value</div>}
                  <div className="flex items-center gap-2 mb-4 mt-1">
                    <span className="text-lg">☁️</span>
                    <span className="text-sm font-bold">Switch to API</span>
                  </div>
                  <div className={`text-3xl font-bold ${isBest ? "text-blue-600" : "text-gray-700"}`}>{formatCurrency(api.monthly_cost)}</div>
                  <div className="text-xs text-gray-400 mt-1">per month · {scenario.model.name}</div>
                  <div className="border-t border-gray-100 my-4" />
                  <div className="text-sm text-gray-500">{formatCurrency(api.daily_cost)}/day</div>
                  <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                    <div>Pay only for what you use</div>
                    <div>No infrastructure to manage</div>
                    <div>Scales instantly</div>
                    <div>Requires API integration work</div>
                  </div>
                </div>
              );
            })()}

            {/* Column 3: Build Custom */}
            {(() => {
              const gpu = scenario.options.rented_gpu;
              const owned = scenario.options.owned_hardware;
              const bestCustom = gpu.monthly_cost < owned.monthly_cost ? "rented" : "owned";
              const customCost = Math.min(gpu.monthly_cost, owned.monthly_cost);
              const isBest = scenario.recommendation === "rented_gpu" || scenario.recommendation === "owned_hardware";
              return (
                <div className={`bg-white border rounded-xl p-5 relative ${isBest ? "border-green-200 border-2 shadow-sm" : "border-gray-200"}`}>
                  {isBest && <div className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-600">Best value</div>}
                  <div className="flex items-center gap-2 mb-4 mt-1">
                    <span className="text-lg">🏗️</span>
                    <span className="text-sm font-bold">Build Custom</span>
                  </div>
                  <div className={`text-3xl font-bold ${isBest ? "text-green-600" : "text-gray-700"}`}>{formatCurrency(customCost)}</div>
                  <div className="text-xs text-gray-400 mt-1">per month · {bestCustom === "rented" ? "rented GPU" : "own hardware"}</div>
                  <div className="border-t border-gray-100 my-4" />
                  <div className="text-sm text-gray-500">{gpu.gpu_count} GPU{gpu.gpu_count > 1 ? "s" : ""} ({scenario.gpu.model})</div>
                  <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                    {bestCustom === "rented" ? (
                      <>
                        <div>Rent: {formatCurrency(gpu.raw_monthly)}/mo</div>
                        <div>Util. adjusted: {formatCurrency(gpu.utilization_adjusted)}/mo</div>
                        <div>Ops overhead: {formatCurrency(gpu.overhead)}/mo</div>
                      </>
                    ) : (
                      <>
                        <div>Amortized: {formatCurrency(owned.per_gpu_monthly)}/gpu/mo</div>
                        <div>Power + colo: {formatCurrency(owned.power_colo)}/mo</div>
                        <div>Ops overhead: {formatCurrency(owned.overhead)}/mo</div>
                        <div className="border-t border-gray-100 pt-1.5 mt-1.5 text-gray-300">
                          CapEx: {formatCurrency(owned.upfront_cost)}
                        </div>
                      </>
                    )}
                    <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                      Full control over data &amp; model
                    </div>
                    <div>Requires ML engineering team</div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Savings callout */}
          {scenario.savings_vs_current !== null && scenario.savings_vs_current > 0 && scenario.current && (
            <div className="p-4 rounded-xl border border-green-200 bg-green-50 mb-6">
              <div className="text-sm font-semibold text-green-600">
                You could save ~{scenario.savings_vs_current.toFixed(0)}% vs your current {scenario.current.product} spend
                ({formatCurrency(scenario.current.monthly_spend - Math.min(scenario.options.cloud_api.monthly_cost, scenario.options.rented_gpu.monthly_cost, scenario.options.owned_hardware.monthly_cost))}/mo)
              </div>
            </div>
          )}

          {/* Cost breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">How we calculated this</h3>
            <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 mb-4">
              <div>
                <div className="font-semibold text-gray-600 mb-1">Cloud API ({scenario.model.name})</div>
                <div>{formatTokens(scenario.inputs.tokens_per_day * scenario.inputs.input_ratio)} input/day × ${scenario.model.input_price}/M</div>
                <div>{formatTokens(scenario.inputs.tokens_per_day * (1 - scenario.inputs.input_ratio))} output/day × ${scenario.model.output_price}/M</div>
                <div className="mt-1 font-medium">= {formatCurrency(scenario.options.cloud_api.daily_cost)}/day × 30</div>
              </div>
              <div>
                <div className="font-semibold text-gray-600 mb-1">Rented GPU ({scenario.options.rented_gpu.gpu_count}x {scenario.gpu.model})</div>
                <div>${scenario.gpu.price_per_hour.toFixed(2)}/hr × 24hr × 30d × {scenario.options.rented_gpu.gpu_count}</div>
                <div>÷ {(scenario.inputs.utilization * 100).toFixed(0)}% util = {formatCurrency(scenario.options.rented_gpu.utilization_adjusted)}</div>
                <div>+ {formatCurrency(scenario.options.rented_gpu.overhead)} ops ({scenario.inputs.team_size} engineers)</div>
              </div>
              <div>
                <div className="font-semibold text-gray-600 mb-1">Own Hardware ({scenario.options.owned_hardware.gpu_count}x {scenario.gpu.model})</div>
                <div>{scenario.options.owned_hardware.gpu_count} × {formatCurrency(scenario.options.owned_hardware.per_gpu_price)} ÷ {scenario.options.owned_hardware.amortization_months}mo</div>
                <div>+ {formatCurrency(scenario.options.owned_hardware.power_colo)} power/colo</div>
                <div>+ {formatCurrency(scenario.options.owned_hardware.overhead)} ops</div>
              </div>
            </div>
          </div>

          {/* Save / Sign up prompt */}
          <div className="mt-6">
            {user ? (
              <div className="flex items-center gap-3">
                {showSaveInput ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                      placeholder="Name this scenario (e.g., Contract Review Q3)"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        if (!saveName.trim() || !analysis) return;
                        await fetch("/api/scenarios", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: saveName, params: analysis, result: scenario }),
                        });
                        setShowSaveInput(false);
                        setSaveName("");
                        // Refresh list
                        const res = await fetch("/api/scenarios");
                        const d = await res.json();
                        setSavedScenarios(d.scenarios || []);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button onClick={() => setShowSaveInput(false)} className="text-sm text-gray-400">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowSaveInput(true)} className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                    Save this scenario
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                Sign up to save this analysis
              </button>
            )}
          </div>

          {/* Saved scenarios list */}
          {savedScenarios.length > 0 && (
            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Saved Scenarios</h3>
              <div className="space-y-2">
                {savedScenarios.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Scenario Builder — only shown after analysis */}
      {analysis && <div className="max-w-7xl mx-auto px-8 pb-8">
        <div className="border-t border-gray-200 pt-8 mb-6">
          <h2 className="text-lg font-bold">Advanced Scenario Builder</h2>
          <p className="text-sm text-gray-400 mt-1">Fine-tune every parameter for a custom analysis</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Workload</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Tokens per day</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={advTokens} onChange={(e) => setAdvTokens(e.target.value.replace(/[^0-9]/g, ""))} />
                <div className="flex gap-1.5 mt-1.5">
                  {PRESETS.map((p) => (
                    <button key={p.label} onClick={() => setAdvTokens(String(p.value))} className={`px-2 py-0.5 text-xs rounded border ${advTokens === String(p.value) ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-400"}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">I/O ratio: {advInputRatio}/{100 - advInputRatio}</label>
                <input type="range" min="10" max="90" step="5" value={advInputRatio} onChange={(e) => setAdvInputRatio(parseInt(e.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Requirements</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Min. quality</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={advQuality} onChange={(e) => setAdvQuality(e.target.value)}>
                  <option value="Frontier">Frontier</option>
                  <option value="Strong">Strong</option>
                  <option value="Good">Good</option>
                  <option value="Budget">Budget</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Infrastructure</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Team size</label>
                <input type="number" min="1" max="50" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={advTeamSize} onChange={(e) => setAdvTeamSize(e.target.value)} />
                <div className="text-xs text-gray-300 mt-1">${parseInt(advTeamSize || "1") * 500}/mo overhead</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">GPU util: {advUtilization}%</label>
                <input type="range" min="10" max="100" step="5" value={advUtilization} onChange={(e) => setAdvUtilization(parseInt(e.target.value))} className="w-full accent-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Summary</h3>
            {advResult ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">API</span><span className="font-semibold text-blue-600">{formatCurrency(advResult.options.cloud_api.monthly_cost)}/mo</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Rented GPU</span><span className="font-semibold text-purple-600">{formatCurrency(advResult.options.rented_gpu.monthly_cost)}/mo</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Own HW</span><span className="font-semibold text-green-600">{formatCurrency(advResult.options.owned_hardware.monthly_cost)}/mo</span></div>
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <div className="text-gray-400">Model: {advResult.model.name}</div>
                  <div className="text-gray-400">GPU: {advResult.gpu.model} ({advResult.options.rented_gpu.gpu_count}x)</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-300">Loading...</div>
            )}
          </div>
        </div>
      </div>}

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-8 py-4 flex justify-between text-xs text-gray-400">
        <span>Data: OpenRouter API (300+ models) · Vast.ai (380+ GPU offers) · Real-time pricing</span>
        <span>ReasonsIQ</span>
      </footer>
    </div>
  );
}
