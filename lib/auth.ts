// Autenticación propia mínima. Al integrar con el CRM de Data Work se reemplaza
// getCurrentUser() por la sesión del CRM, conservando los roles 'admin' y 'agent'.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "agent";
  is_demo: number;
  active: number;
}

const COOKIE = "rw_session";
const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export async function login(email: string, password: string): Promise<User | null> {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email.trim().toLowerCase()) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, row.id, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    expires,
  });
  return row;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("UPDATE sessions SET expires_at = '1970-01-01' WHERE token = ?").run(token);
  jar.set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.is_demo, u.active FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
