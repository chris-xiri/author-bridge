import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { setAuthCookie, sha256 } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const env = getEnv();
  if (email !== env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const hash = sha256(password ?? "");
  if (hash !== env.ADMIN_PASSWORD_HASH) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await setAuthCookie(hash);
  return NextResponse.json({ ok: true });
}

