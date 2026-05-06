import { NextResponse } from "next/server";
import { z } from "zod";
import { listCampaigns, saveCampaigns } from "@/lib/sheets";
import { nowIso } from "@/lib/utils";

const patchSchema = z.object({
  action: z.enum(["archive", "unarchive"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const campaigns = await listCampaigns();
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  campaign.status = parsed.data.action === "archive" ? "archived" : "draft";
  campaign.updatedAt = nowIso();
  await saveCampaigns(campaigns);
  return NextResponse.json({ ok: true, campaign });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaigns = await listCampaigns();
  const next = campaigns.filter((c) => c.id !== id);
  if (next.length === campaigns.length) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  await saveCampaigns(next);
  return NextResponse.json({ ok: true });
}

