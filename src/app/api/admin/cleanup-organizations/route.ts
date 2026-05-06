import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { listOrganizations, saveOrganizations } from "@/lib/sheets";
import type { OrganizationRow } from "@/lib/types";

function norm(value: string) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGenericOrDistrictName(name: string) {
  const s = (name || "").toLowerCase().trim();
  if (!s) return true;
  if (/^(public school|school|about .+ school|sites?)$/.test(s)) return true;
  if (/(union free school|school district|public schools|department of education|central school district|independent school district)/.test(s)) return true;
  if (/^great neck union free school$/i.test(s)) return true;
  return false;
}

function chooseBetter(a: OrganizationRow, b: OrganizationRow) {
  const aScore =
    (a.website ? 2 : 0) +
    (a.schoolLevel && a.schoolLevel !== "unknown" ? 2 : 0) +
    (isGenericOrDistrictName(a.name) ? 0 : 4);
  const bScore =
    (b.website ? 2 : 0) +
    (b.schoolLevel && b.schoolLevel !== "unknown" ? 2 : 0) +
    (isGenericOrDistrictName(b.name) ? 0 : 4);
  return bScore > aScore ? b : a;
}

export async function POST(req: Request) {
  try {
    if (!(await isAuthenticated())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = !!body.dryRun;

    const orgs = await listOrganizations();
    const filtered = orgs.filter((o) => !isGenericOrDistrictName(o.name));

    const byKey = new Map<string, OrganizationRow>();
    for (const org of filtered) {
      const key = `${norm(org.name)}|${norm(org.city)}|${norm(org.state)}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, org);
      } else {
        byKey.set(key, chooseBetter(prev, org));
      }
    }
    const deduped = Array.from(byKey.values());
    const removedCount = orgs.length - deduped.length;

    if (!dryRun) {
      await saveOrganizations(deduped);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      before: orgs.length,
      after: deduped.length,
      removedCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 },
    );
  }
}
