import { getDb } from "@/lib/db";
import { verifyPassword, setAuthCookie } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email.toLowerCase().trim()) as {
      id: number; email: string; name: string | null; password_hash: string;
    } | undefined;

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await setAuthCookie(user.id);

    const firm = db.prepare("SELECT * FROM firms WHERE user_id = ? LIMIT 1").get(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      firm: firm || null,
    });
  } catch (err: unknown) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
