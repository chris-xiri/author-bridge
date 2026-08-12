import { cookies } from "next/headers";

const AUTH_COOKIE = "ab_admin_auth";
const SESSION_COOKIE = "crm_session";

export async function isAuthenticated() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value || jar.get(SESSION_COOKIE)?.value;
  return Boolean(token && token.length > 0);
}

export async function setAuthCookie() {
  const jar = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
  jar.set(AUTH_COOKIE, "authenticated", options);
  jar.set(SESSION_COOKIE, "authenticated", options);
}

export async function clearAuthCookie() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  jar.delete(SESSION_COOKIE);
}
