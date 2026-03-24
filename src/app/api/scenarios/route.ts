import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.firm) return NextResponse.json({ scenarios: [] });

  const db = getDb();
  const scenarios = db.prepare(
    "SELECT id, name, params, result, created_at, updated_at FROM saved_scenarios WHERE firm_id=? ORDER BY updated_at DESC"
  ).all(session.firm.id);

  return NextResponse.json({
    scenarios: (scenarios as Record<string, unknown>[]).map((s) => ({
      ...s,
      params: JSON.parse(s.params as string),
      result: s.result ? JSON.parse(s.result as string) : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.firm) return NextResponse.json({ error: "Create a firm profile first" }, { status: 400 });

  const { name, params, result } = await request.json();
  if (!name || !params) return NextResponse.json({ error: "Name and params are required" }, { status: 400 });

  const db = getDb();
  const res = db.prepare(
    "INSERT INTO saved_scenarios (firm_id, name, params, result) VALUES (?, ?, ?, ?)"
  ).run(session.firm.id, name, JSON.stringify(params), result ? JSON.stringify(result) : null);

  return NextResponse.json({
    scenario: { id: res.lastInsertRowid, name, params, result, created_at: new Date().toISOString() },
  });
}
