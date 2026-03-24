import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getDb } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "reasonsiq_token";
const TOKEN_EXPIRY = "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

export async function setAuthCookie(userId: number) {
  const token = createToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

interface UserRow {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

interface FirmRow {
  id: number;
  user_id: number;
  name: string;
  industry: string | null;
  team_size: number | null;
  current_product: string | null;
  current_price_per_seat: number | null;
  current_monthly_spend: number | null;
  ai_description: string | null;
}

export async function getSession(): Promise<{ user: UserRow; firm: FirmRow | null } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(payload.userId) as UserRow | undefined;
  if (!user) return null;

  const firm = db.prepare("SELECT * FROM firms WHERE user_id = ? LIMIT 1").get(user.id) as FirmRow | undefined;

  return { user, firm: firm || null };
}
