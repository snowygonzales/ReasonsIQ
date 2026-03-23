/**
 * Curated quality tier assignments for known models.
 *
 * Tiers:
 *   Frontier — top benchmark performers (GPT-4o, Claude Opus/Sonnet, Gemini Pro)
 *   Strong   — excellent for most production use (70B+ class, top mid-range)
 *   Good     — solid for focused tasks (small but capable)
 *   Budget   — cost-optimized, lower quality (tiny/nano models)
 *
 * Matching is done by checking if the model ID contains the pattern.
 * Order matters — first match wins.
 */

const TIER_PATTERNS: Array<{ pattern: string; tier: string }> = [
  // Good (specific "mini" variants MUST come before their frontier parents)
  { pattern: "gpt-4o-mini", tier: "Good" },
  { pattern: "gpt-4.1-mini", tier: "Good" },
  { pattern: "gpt-4.1-nano", tier: "Good" },
  { pattern: "gpt-3.5", tier: "Good" },

  // Frontier
  { pattern: "gpt-4o", tier: "Frontier" },
  { pattern: "gpt-4-turbo", tier: "Frontier" },
  { pattern: "gpt-4.1", tier: "Frontier" },
  { pattern: "claude-opus", tier: "Frontier" },
  { pattern: "claude-sonnet", tier: "Frontier" },
  { pattern: "claude-3.5-sonnet", tier: "Frontier" },
  { pattern: "claude-4", tier: "Frontier" },
  { pattern: "gemini-2.0-pro", tier: "Frontier" },
  { pattern: "gemini-2.5-pro", tier: "Frontier" },
  { pattern: "gemini-1.5-pro", tier: "Frontier" },
  { pattern: "openai/o1", tier: "Frontier" },
  { pattern: "openai/o3", tier: "Frontier" },
  { pattern: "deepseek-r1", tier: "Frontier" },

  // Strong
  { pattern: "deepseek-chat", tier: "Strong" },
  { pattern: "deepseek-v3", tier: "Strong" },
  { pattern: "gemini-2.0-flash", tier: "Strong" },
  { pattern: "gemini-2.5-flash", tier: "Strong" },
  { pattern: "gemini-1.5-flash", tier: "Strong" },
  { pattern: "llama-3.3-70b", tier: "Strong" },
  { pattern: "llama-3.1-70b", tier: "Strong" },
  { pattern: "llama-3.1-405b", tier: "Strong" },
  { pattern: "qwen-2.5-72b", tier: "Strong" },
  { pattern: "qwen-2.5-coder-32b", tier: "Strong" },
  { pattern: "mistral-large", tier: "Strong" },
  { pattern: "mistral-medium", tier: "Strong" },
  { pattern: "command-r-plus", tier: "Strong" },
  { pattern: "claude-haiku", tier: "Strong" },
  { pattern: "dbrx", tier: "Strong" },
  { pattern: "yi-large", tier: "Strong" },
  { pattern: "mixtral-8x22b", tier: "Strong" },

  // Good (continued)
  { pattern: "llama-3.1-8b", tier: "Good" },
  { pattern: "llama-3.2-3b", tier: "Good" },
  { pattern: "mistral-7b", tier: "Good" },
  { pattern: "mistral-small", tier: "Good" },
  { pattern: "mixtral-8x7b", tier: "Good" },
  { pattern: "phi-3", tier: "Good" },
  { pattern: "phi-4", tier: "Good" },
  { pattern: "qwen-2.5-7b", tier: "Good" },
  { pattern: "qwen-2.5-14b", tier: "Good" },
  { pattern: "qwen-2.5-32b", tier: "Good" },
  { pattern: "gemma-2-27b", tier: "Good" },
  { pattern: "gemma-2-9b", tier: "Good" },
  { pattern: "command-r", tier: "Good" },

  // Budget
  { pattern: "llama-3.2-1b", tier: "Budget" },
  { pattern: "gemma-2-2b", tier: "Budget" },
  { pattern: "phi-3-mini", tier: "Budget" },
  { pattern: "qwen-2.5-0.5b", tier: "Budget" },
  { pattern: "qwen-2.5-1.5b", tier: "Budget" },
  { pattern: "qwen-2.5-3b", tier: "Budget" },
  { pattern: "smollm", tier: "Budget" },
  { pattern: "tinyllama", tier: "Budget" },
];

export type QualityTier = "Frontier" | "Strong" | "Good" | "Budget";

export function assignQualityTier(modelId: string): QualityTier {
  const id = modelId.toLowerCase();
  for (const { pattern, tier } of TIER_PATTERNS) {
    if (id.includes(pattern.toLowerCase())) {
      return tier as QualityTier;
    }
  }
  // Default heuristic: if we can't match, check parameter hints in the ID
  if (id.match(/\b(70b|72b|65b|405b)\b/)) return "Strong";
  if (id.match(/\b(7b|8b|13b|14b|32b|34b)\b/)) return "Good";
  if (id.match(/\b(0\.5b|1b|1\.5b|2b|3b)\b/)) return "Budget";
  return "Good"; // safe default for unknown models
}
