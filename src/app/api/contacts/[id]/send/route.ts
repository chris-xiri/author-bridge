import { NextResponse } from "next/server";
import { z } from "zod";
import { addEvent, isSuppressed } from "@/lib/crm";
import { getEnv } from "@/lib/env";
import { sendEmail } from "@/lib/resend";
import { listCampaigns, listContacts, saveContacts } from "@/lib/sheets";
import { nowIso } from "@/lib/utils";

const bodySchema = z.object({
  campaignId: z.string().min(1),
});

function renderBody(raw: string, contact: { fullName: string; email: string }) {
  const { APP_BASE_URL } = getEnv();
  const unsub = `${APP_BASE_URL}/api/unsubscribe?email=${encodeURIComponent(contact.email)}`;
  return `${raw.replaceAll("{{fullName}}", contact.fullName || "there")}
<br/><br/><small>If you prefer not to hear from us, unsubscribe <a href="${unsub}">here</a>.</small>`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const { campaignId } = parsed.data;

  const contacts = await listContacts();
  const campaigns = await listCampaigns();
  const contact = contacts.find((c) => c.id === id);
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "Contact has no email" }, { status: 400 });
  if (contact.unsubscribe === "true") return NextResponse.json({ error: "Contact unsubscribed" }, { status: 400 });
  if (await isSuppressed(contact.email)) return NextResponse.json({ error: "Contact suppressed" }, { status: 400 });

  try {
    const html = renderBody(campaign.body, contact);
    const sendResult = await sendEmail({
      to: contact.email,
      subject: campaign.subject,
      html,
    });
    contact.status = "approved";
    contact.outreachStatus = "sent";
    contact.campaignId = campaign.id;
    contact.updatedAt = nowIso();
    await saveContacts(contacts);
    await addEvent({
      contactId: contact.id,
      campaignId: campaign.id,
      eventType: "sent",
      providerMessageId: sendResult.id ?? "",
      payload: JSON.stringify(sendResult),
    });
    return NextResponse.json({ ok: true, id: sendResult.id ?? "" });
  } catch (error) {
    await addEvent({
      contactId: contact.id,
      campaignId: campaign.id,
      eventType: "bounced",
      providerMessageId: "",
      payload: JSON.stringify({ error: error instanceof Error ? error.message : "send failed" }),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Send failed" },
      { status: 500 },
    );
  }
}

