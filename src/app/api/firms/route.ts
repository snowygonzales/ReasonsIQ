import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ firm: session.firm });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, industry, team_size, current_product, current_price_per_seat, current_monthly_spend, ai_description } = body;

  if (!name) return NextResponse.json({ error: "Firm name is required" }, { status: 400 });

  const db = getDb();

  if (session.firm) {
    // Update existing
    db.prepare(`
      UPDATE firms SET name=?, industry=?, team_size=?, current_product=?, current_price_per_seat=?,
        current_monthly_spend=?, ai_description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(name, industry || null, team_size || null, current_product || null,
      current_price_per_seat || null, current_monthly_spend || null, ai_description || null, session.firm.id);

    const updated = db.prepare("SELECT * FROM firms WHERE id=?").get(session.firm.id);
    return NextResponse.json({ firm: updated });
  } else {
    // Create new
    const result = db.prepare(`
      INSERT INTO firms (user_id, name, industry, team_size, current_product, current_price_per_seat, current_monthly_spend, ai_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(session.user.id, name, industry || null, team_size || null, current_product || null,
      current_price_per_seat || null, current_monthly_spend || null, ai_description || null);

    const firm = db.prepare("SELECT * FROM firms WHERE id=?").get(result.lastInsertRowid);
    return NextResponse.json({ firm });
  }
}
