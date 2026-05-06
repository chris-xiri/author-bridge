import { NextRequest, NextResponse } from "next/server";
import { listContacts, saveContacts } from "@/lib/sheets";
import { suppressEmail } from "@/lib/crm";
import { nowIso } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  const contacts = await listContacts();
  const match = contacts.find((c) => c.email.toLowerCase() === email);
  if (match) {
    match.unsubscribe = "true";
    match.outreachStatus = "unsubscribed";
    match.updatedAt = nowIso();
    await saveContacts(contacts);
  }
  await suppressEmail(email, "unsubscribe_link");
  return NextResponse.json({ ok: true, email });
}

