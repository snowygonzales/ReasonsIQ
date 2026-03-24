// Industry-specific workload templates with business-friendly language
// and competitor product pricing for comparison
//
// Token computation: count_field × size_field × tokensPerUnit
// e.g., 200 contracts/week × 30 pages × 500 tokens/page = 3M tokens/week

export interface Competitor {
  name: string;
  price_per_seat: number; // $/month
  description: string;
}

export interface WorkloadField {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface WorkloadTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  // First field: count (documents, conversations, etc.)
  // Second field: size/complexity multiplier
  countField: WorkloadField;
  sizeField: WorkloadField;
  tokensPerSizeUnit: number; // tokens per unit of the size field (e.g., 500 tokens/page)
  periodDivisor: number; // 1 for daily fields, 7 for weekly fields
  competitors: Competitor[];
  quality: string;
  inputRatio: number;
  teamOverhead: number;
  utilization: number;
}

export interface IndustryConfig {
  id: string;
  name: string;
  icon: string;
  templates: WorkloadTemplate[];
}

export const INDUSTRIES: IndustryConfig[] = [
  {
    id: "legal",
    name: "Legal",
    icon: "⚖️",
    templates: [
      {
        id: "contract-review",
        name: "Contract Review",
        icon: "📝",
        description: "Automated review, redlining, and risk flagging of legal contracts",
        countField: { key: "contracts_per_week", label: "Contracts reviewed / week", default: 200, min: 10, max: 5000, step: 10 },
        sizeField: { key: "pages_per_contract", label: "Avg pages per contract", default: 30, min: 5, max: 200, step: 5 },
        tokensPerSizeUnit: 500, // ~500 tokens per page
        periodDivisor: 7, // weekly → daily
        competitors: [
          { name: "Microsoft Copilot", price_per_seat: 30, description: "General-purpose AI assistant" },
          { name: "Harvey AI", price_per_seat: 100, description: "Legal-specific AI platform" },
          { name: "CoCounsel (TR)", price_per_seat: 150, description: "Thomson Reuters legal AI" },
        ],
        quality: "Frontier",
        inputRatio: 0.8,
        teamOverhead: 2,
        utilization: 0.5,
      },
      {
        id: "discovery",
        name: "Document Discovery",
        icon: "🔍",
        description: "AI-powered e-discovery for litigation document review",
        countField: { key: "documents_per_day", label: "Documents to review / day", default: 500, min: 50, max: 10000, step: 50 },
        sizeField: { key: "pages_per_doc", label: "Avg pages per document", default: 10, min: 1, max: 100, step: 1 },
        tokensPerSizeUnit: 500,
        periodDivisor: 1,
        competitors: [
          { name: "Relativity", price_per_seat: 200, description: "E-discovery platform" },
          { name: "Everlaw", price_per_seat: 180, description: "Cloud-based litigation" },
          { name: "Harvey AI", price_per_seat: 100, description: "Legal AI platform" },
        ],
        quality: "Frontier",
        inputRatio: 0.85,
        teamOverhead: 3,
        utilization: 0.4,
      },
    ],
  },
  {
    id: "support",
    name: "Customer Support",
    icon: "💬",
    templates: [
      {
        id: "support-chatbot",
        name: "Support Chatbot",
        icon: "🤖",
        description: "AI chatbot handling customer inquiries and ticket deflection",
        countField: { key: "conversations_per_day", label: "Customer conversations / day", default: 2000, min: 100, max: 100000, step: 100 },
        sizeField: { key: "replies_per_convo", label: "Avg replies per conversation", default: 8, min: 1, max: 30, step: 1 },
        tokensPerSizeUnit: 400, // ~400 tokens per reply (prompt + response)
        periodDivisor: 1,
        competitors: [
          { name: "Zendesk AI", price_per_seat: 50, description: "AI-powered customer service" },
          { name: "Intercom Fin", price_per_seat: 99, description: "AI customer service agent" },
          { name: "Ada CX", price_per_seat: 75, description: "Automated customer experience" },
        ],
        quality: "Strong",
        inputRatio: 0.65,
        teamOverhead: 3,
        utilization: 0.6,
      },
      {
        id: "knowledge-base",
        name: "Internal Knowledge Base",
        icon: "📚",
        description: "AI-powered search over company docs, policies, and SOPs",
        countField: { key: "employees", label: "Employees using it", default: 250, min: 10, max: 10000, step: 10 },
        sizeField: { key: "searches_per_day", label: "Searches per employee / day", default: 5, min: 1, max: 20, step: 1 },
        tokensPerSizeUnit: 6000, // ~6000 tokens per search (query + context + response)
        periodDivisor: 1,
        competitors: [
          { name: "Microsoft Copilot", price_per_seat: 30, description: "General-purpose AI assistant" },
          { name: "Glean", price_per_seat: 25, description: "Enterprise AI search" },
          { name: "Guru", price_per_seat: 15, description: "Knowledge management" },
        ],
        quality: "Strong",
        inputRatio: 0.75,
        teamOverhead: 2,
        utilization: 0.5,
      },
    ],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: "🏥",
    templates: [
      {
        id: "clinical-docs",
        name: "Clinical Documentation",
        icon: "📋",
        description: "Automated clinical notes, discharge summaries, and patient documentation",
        countField: { key: "patients_per_day", label: "Patient encounters / day", default: 300, min: 50, max: 5000, step: 50 },
        sizeField: { key: "note_sections", label: "Avg sections per note", default: 8, min: 3, max: 15, step: 1 },
        tokensPerSizeUnit: 600, // ~600 tokens per note section
        periodDivisor: 1,
        competitors: [
          { name: "Nuance DAX", price_per_seat: 200, description: "AI clinical documentation" },
          { name: "Abridge", price_per_seat: 150, description: "Medical conversation AI" },
          { name: "Suki AI", price_per_seat: 100, description: "Voice-powered clinical notes" },
        ],
        quality: "Frontier",
        inputRatio: 0.7,
        teamOverhead: 4,
        utilization: 0.5,
      },
      {
        id: "medical-coding",
        name: "Medical Coding",
        icon: "🏷️",
        description: "Automated ICD/CPT coding from clinical documentation",
        countField: { key: "charts_per_day", label: "Charts to code / day", default: 400, min: 50, max: 5000, step: 50 },
        sizeField: { key: "codes_per_chart", label: "Avg codes per chart", default: 5, min: 1, max: 20, step: 1 },
        tokensPerSizeUnit: 800, // ~800 tokens per coding pass
        periodDivisor: 1,
        competitors: [
          { name: "3M 360 Encompass", price_per_seat: 250, description: "AI-powered coding" },
          { name: "Nym Health", price_per_seat: 120, description: "Autonomous medical coding" },
          { name: "Fathom", price_per_seat: 80, description: "AI medical coding" },
        ],
        quality: "Frontier",
        inputRatio: 0.8,
        teamOverhead: 3,
        utilization: 0.4,
      },
    ],
  },
  {
    id: "finance",
    name: "Finance",
    icon: "📊",
    templates: [
      {
        id: "report-analysis",
        name: "Report & Filing Analysis",
        icon: "📈",
        description: "Automated analysis of financial reports, 10-K filings, and earnings",
        countField: { key: "reports_per_week", label: "Reports analyzed / week", default: 100, min: 10, max: 2000, step: 10 },
        sizeField: { key: "pages_per_report", label: "Avg pages per report", default: 50, min: 10, max: 500, step: 10 },
        tokensPerSizeUnit: 500, // ~500 tokens per page
        periodDivisor: 7,
        competitors: [
          { name: "Bloomberg Terminal AI", price_per_seat: 2000, description: "Financial data + AI" },
          { name: "Kensho (S&P)", price_per_seat: 500, description: "AI analytics for finance" },
          { name: "Microsoft Copilot", price_per_seat: 30, description: "General AI assistant" },
        ],
        quality: "Frontier",
        inputRatio: 0.85,
        teamOverhead: 3,
        utilization: 0.5,
      },
      {
        id: "compliance-review",
        name: "Compliance Review",
        icon: "✅",
        description: "Automated regulatory compliance checks and policy review",
        countField: { key: "documents_per_week", label: "Documents reviewed / week", default: 200, min: 20, max: 5000, step: 20 },
        sizeField: { key: "checks_per_doc", label: "Compliance checks per doc", default: 5, min: 1, max: 20, step: 1 },
        tokensPerSizeUnit: 3000, // ~3000 tokens per compliance check
        periodDivisor: 7,
        competitors: [
          { name: "Ascent RegTech", price_per_seat: 300, description: "Regulatory compliance AI" },
          { name: "ComplyAdvantage", price_per_seat: 150, description: "Financial crime compliance" },
          { name: "Microsoft Copilot", price_per_seat: 30, description: "General AI assistant" },
        ],
        quality: "Frontier",
        inputRatio: 0.8,
        teamOverhead: 4,
        utilization: 0.4,
      },
    ],
  },
];

// Compute tokens/day from template and user values
// Formula: count × size × tokensPerSizeUnit / periodDivisor
export function computeTemplateTokens(
  template: WorkloadTemplate,
  values: Record<string, number>,
): number {
  const count = values[template.countField.key] ?? template.countField.default;
  const size = values[template.sizeField.key] ?? template.sizeField.default;
  const tokensPerDay = (count * size * template.tokensPerSizeUnit) / template.periodDivisor;
  return Math.round(tokensPerDay);
}
