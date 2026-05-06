import { NextResponse } from "next/server";
import { z } from "zod";
import { addEvent, suppressEmail } from "@/lib/crm";
import { getEnv } from "@/lib/env";
import { listContacts, saveContacts } from "@/lib/sheets";
import { nowIso } from "@/lib/utils";

const schema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).optional(),
  }),
});

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== getEnv().RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await req.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const type = parsed.data.type.toLowerCase();
  const to = parsed.data.data.to?.[0]?.toLowerCase() ?? "";
  const contacts = await listContacts();
  const match = contacts.find((c) => c.email.toLowerCase() === to);
  if (match) {
    if (type.includes("bounce")) match.outreachStatus = "bounced";
    if (type.includes("reply")) match.outreachStatus = "replied";
    if (type.includes("unsubscribe")) {
      match.outreachStatus = "unsubscribed";
      match.unsubscribe = "true";
      await suppressEmail(match.email, "unsubscribe");
    }
    match.updatedAt = nowIso();
    await saveContacts(contacts);
    await addEvent({
      contactId: match.id,
      campaignId: match.campaignId ?? "",
      eventType: type.includes("delivery")
        ? "delivered"
        : type.includes("bounce")
          ? "bounced"
          : type.includes("reply")
            ? "replied"
            : "unsubscribed",
      providerMessageId: parsed.data.data.email_id ?? "",
      payload: JSON.stringify(payload),
    });
  }

  return NextResponse.json({ ok: true });
}

