import { cookies } from "next/headers";
import { createHmac } from "crypto";

const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASS ?? "admin123";
const ADMIN_TOKEN_NAME = "nishinae.admin_token";
const TOKEN_SECRET = process.env.ADMIN_SECRET ?? "nishinae-admin-secret-change-me";

function encodeToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expectedSig = createHmac("sha256", TOKEN_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (expectedSig !== parts[2]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function validateCredentials(username: string, password: string): boolean {
  return username === ADMIN_USER && password === ADMIN_PASS;
}

export function createAdminToken(): string {
  return encodeToken({ role: "admin", iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 });
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_NAME)?.value;
  if (!token) return false;
  const payload = verifyToken(token);
  return payload?.role === "admin";
}

export { ADMIN_TOKEN_NAME };
