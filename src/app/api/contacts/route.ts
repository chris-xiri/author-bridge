import { NextRequest, NextResponse } from "next/server";
import { listContacts, listOrganizations } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    const campaign = params.get("campaign");
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");

    let contacts = await listContacts();

    if (status) contacts = contacts.filter((c) => c.status === status);
    if (campaign) contacts = contacts.filter((c) => c.campaignId === campaign);

    if (pageParam || pageSizeParam) {
      const page = Number(pageParam ?? "1");
      const pageSize = Number(pageSizeParam ?? "50");
      const start = Math.max(0, (page - 1) * pageSize);
      const paged = contacts.slice(start, start + pageSize);
      return NextResponse.json({
        items: paged,
        page,
        total: contacts.length,
        pageSize,
      });
    }

    return NextResponse.json({
      items: contacts,
      page: 1,
      total: contacts.length,
      pageSize: contacts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list contacts" },
      { status: 500 },
    );
  }
}
