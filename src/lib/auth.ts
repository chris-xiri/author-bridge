import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

const AUTH_COOKIE = "ab_admin_auth";

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function isAuthenticated() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const { ADMIN_PASSWORD_HASH } = getEnv();
  return safeEqual(token, ADMIN_PASSWORD_HASH);
}

export async function setAuthCookie(passwordHash: string) {
  const jar = await cookies();
  const secureCookie = getEnv().APP_BASE_URL.startsWith("https://");
  jar.set(AUTH_COOKIE, passwordHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}
