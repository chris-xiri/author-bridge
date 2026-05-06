import { NextRequest, NextResponse } from "next/server";
import { listContacts, listOrganizations, saveContacts, saveOrganizations } from "@/lib/sheets";
import { nowIso } from "@/lib/utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  const contacts = await listContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const contact = contacts[idx];
  if (action === "approve") contact.status = "approved";
  else if (action === "reject") contact.status = "rejected";
  else if (action === "update") {
    const patch = (await req.json()) as Record<string, unknown>;
    if (typeof patch.fullName === "string") contact.fullName = patch.fullName.trim();
    if (typeof patch.title === "string") contact.title = patch.title.trim();
    if (typeof patch.schoolName === "string") {
      const nextSchool = patch.schoolName.trim();
      contact.schoolName = nextSchool;
      // Keep org name aligned with manual school edits so derived views stay consistent.
      if (contact.orgId && nextSchool) {
        const orgs = await listOrganizations();
        const orgIdx = orgs.findIndex((o) => o.id === contact.orgId);
        if (orgIdx >= 0) {
          orgs[orgIdx].name = nextSchool;
          orgs[orgIdx].updatedAt = nowIso();
          await saveOrganizations(orgs);
        }
      }
    }
    if (typeof patch.schoolLevel === "string") contact.schoolLevel = patch.schoolLevel.trim().toLowerCase() as typeof contact.schoolLevel;
    if (typeof patch.email === "string") contact.email = patch.email.trim().toLowerCase();
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  contact.updatedAt = nowIso();
  contacts[idx] = contact;
  await saveContacts(contacts);
  return NextResponse.json({ ok: true, contact });
}
