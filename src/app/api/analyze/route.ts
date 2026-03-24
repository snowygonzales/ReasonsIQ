import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { INDUSTRIES, computeTemplateTokens } from "@/lib/industry-templates";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an AI cost analyst. Given a user's description of their current AI setup or needs, extract structured information for a cost comparison tool.

Available industry templates:
${INDUSTRIES.map((ind) =>
  `${ind.id} (${ind.name}): ${ind.templates.map((t) => `${t.id} — ${t.name} (fields: ${t.countField.key}, ${t.sizeField.key})`).join(", ")}`
).join("\n")}

You MUST respond with valid JSON only, no other text. Extract these fields:

{
  "industry": "legal|support|healthcare|finance",
  "template_id": "one of the template IDs listed above",
  "current_product": "name of their current AI product (e.g., Microsoft Copilot, Harvey AI) or null",
  "current_price_per_seat": number or null (monthly per-user cost),
  "team_size": number (total employees/users),
  "current_monthly_spend": number or null (total monthly AI spend, calculate from seats × price if given),
  "workload_params": {
    "field_key": value (match the template's field keys and provide estimated values)
  },
  "quality_needed": "Frontier|Strong|Good|Budget",
  "summary": "One sentence describing their situation"
}

If information is missing, make reasonable estimates based on the industry and team size. Always provide your best guess rather than null for workload params.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, industry } = body as { description: string; industry?: string };

    if (!description || description.trim().length < 10) {
      return NextResponse.json({ error: "Please provide a description of your AI setup (at least 10 characters)" }, { status: 400 });
    }

    const userPrompt = industry
      ? `Industry hint: ${industry}\n\nUser description: ${description}`
      : `User description: ${description}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Validate and enrich with template data
    const industryConfig = INDUSTRIES.find((i) => i.id === analysis.industry);
    const template = industryConfig?.templates.find((t) => t.id === analysis.template_id);

    // Compute tokens/day from workload params using template formula
    let tokensPerDay = 0;
    if (template) {
      tokensPerDay = computeTemplateTokens(template, analysis.workload_params || {});
    }

    return NextResponse.json({
      ...analysis,
      tokens_per_day: Math.round(tokensPerDay),
      template: template ? {
        id: template.id,
        name: template.name,
        quality: template.quality,
        inputRatio: template.inputRatio,
        teamOverhead: template.teamOverhead,
        utilization: template.utilization,
        competitors: template.competitors,
      } : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/analyze] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
