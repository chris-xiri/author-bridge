import { NextRequest, NextResponse } from "next/server";
import { listContacts, listOrganizations } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    const campaign = params.get("campaign");
    const page = Number(params.get("page") ?? "1");
    const pageSize = 25;

    let contacts = await listContacts();

    if (status) contacts = contacts.filter((c) => c.status === status);
    if (campaign) contacts = contacts.filter((c) => c.campaignId === campaign);

    const start = Math.max(0, (page - 1) * pageSize);
    const paged = contacts.slice(start, start + pageSize);
    return NextResponse.json({
      items: paged,
      page,
      total: contacts.length,
      pageSize,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list contacts" },
      { status: 500 },
    );
  }
}
