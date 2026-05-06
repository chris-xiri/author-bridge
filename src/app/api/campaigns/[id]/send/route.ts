import { NextResponse } from "next/server";
import { addEvent, isSuppressed } from "@/lib/crm";
import { sendEmail } from "@/lib/resend";
import { getEnv } from "@/lib/env";
import { listCampaigns, listContacts, saveCampaigns, saveContacts } from "@/lib/sheets";
import { nowIso } from "@/lib/utils";

const MAX_SEND_PER_RUN = 50;

function renderBody(raw: string, contact: { fullName: string; email: string }) {
  const { APP_BASE_URL } = getEnv();
  const unsub = `${APP_BASE_URL}/api/unsubscribe?email=${encodeURIComponent(contact.email)}`;
  return `${raw.replaceAll("{{fullName}}", contact.fullName || "there")}
<br/><br/><small>If you prefer not to hear from us, unsubscribe <a href="${unsub}">here</a>.</small>`;
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaigns = await listCampaigns();
  const contacts = await listContacts();
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const eligible = contacts.filter(
    (c) =>
      c.status === "approved" &&
      c.unsubscribe !== "true" &&
      (c.outreachStatus === "none" || c.outreachStatus === "replied") &&
      c.email,
  );

  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const contact of eligible.slice(0, MAX_SEND_PER_RUN)) {
    attempted += 1;
    if (await isSuppressed(contact.email)) {
      skipped += 1;
      continue;
    }
    try {
      const html = renderBody(campaign.body, contact);
      const sendResult = await sendEmail({
        to: contact.email,
        subject: campaign.subject,
        html,
      });
      contact.outreachStatus = "sent";
      contact.campaignId = campaign.id;
      contact.updatedAt = nowIso();
      sent += 1;
      await addEvent({
        contactId: contact.id,
        campaignId: campaign.id,
        eventType: "sent",
        providerMessageId: sendResult.id ?? "",
        payload: JSON.stringify(sendResult),
      });
    } catch (err) {
      failed += 1;
      await addEvent({
        contactId: contact.id,
        campaignId: campaign.id,
        eventType: "bounced",
        providerMessageId: "",
        payload: JSON.stringify({ error: err instanceof Error ? err.message : "send failed" }),
      });
    }
  }

  campaign.status = "sent";
  campaign.updatedAt = nowIso();
  await saveContacts(contacts);
  await saveCampaigns(campaigns);

  return NextResponse.json({ attempted, sent, skipped, failed });
}

