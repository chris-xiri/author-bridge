import { NextResponse } from "next/server";
import { z } from "zod";
import { createCampaign } from "@/lib/crm";
import { ensureSheetSchema, listCampaigns } from "@/lib/sheets";

const schema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    await ensureSheetSchema();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const campaign = await createCampaign(parsed.data.name, parsed.data.subject, parsed.data.body);
    return NextResponse.json(campaign);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create campaign" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    await ensureSheetSchema();
    const campaigns = await listCampaigns();
    return NextResponse.json(campaigns);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load campaigns" },
      { status: 500 },
    );
  }
}
