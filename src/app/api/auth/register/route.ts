import { getDb } from "@/lib/db";
import { hashPassword, setAuthCookie } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hash = await hashPassword(password);
    const result = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)").run(email.toLowerCase().trim(), hash, name || null);
    const userId = result.lastInsertRowid as number;

    await setAuthCookie(userId);

    return NextResponse.json({
      user: { id: userId, email: email.toLowerCase().trim(), name: name || null },
    });
  } catch (err: unknown) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
