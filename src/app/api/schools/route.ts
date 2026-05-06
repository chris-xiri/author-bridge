import { NextRequest, NextResponse } from "next/server";
import { listContacts, listOrganizations } from "@/lib/sheets";

function norm(v: string) {
  return (v || "").trim();
}

function extractCounty(text: string) {
  const m = text.match(/\b([A-Z][A-Za-z.\- ]+ County)\b/i);
  return m?.[1] ? norm(m[1]) : "";
}

function extractZip(text: string) {
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? "";
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const q = (params.get("q") ?? "").toLowerCase().trim();
    const state = norm(params.get("state") ?? "");
    const county = norm(params.get("county") ?? "");
    const city = norm(params.get("city") ?? "");
    const zip = norm(params.get("zip") ?? "");

    const [contacts, orgs] = await Promise.all([listContacts(), listOrganizations()]);
    const contactsByOrg = new Map<string, typeof contacts>();
    for (const c of contacts) {
      const arr = contactsByOrg.get(c.orgId) ?? [];
      arr.push(c);
      contactsByOrg.set(c.orgId, arr);
    }

    let rows = orgs.map((o) => {
      const orgContacts = contactsByOrg.get(o.id) ?? [];
      const sourceText = `${o.sourceQuery ?? ""} ${o.sourceUrl ?? ""} ${o.website ?? ""}`;
      return {
        id: o.id,
        schoolName: o.name || "Unknown School",
        schoolLevel: o.schoolLevel || "unknown",
        address: o.address || "",
        city: o.city || "",
        state: o.state || "",
        county: o.county || extractCounty(sourceText),
        zip: o.zip || extractZip(sourceText),
        website: o.website || "",
        contacts: orgContacts.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          title: c.title,
          schoolLevel: c.schoolLevel,
          email: c.email,
          status: c.status,
          outreachStatus: c.outreachStatus,
        })),
      };
    });

    if (state) rows = rows.filter((r) => r.state.toLowerCase() === state.toLowerCase());
    if (county) rows = rows.filter((r) => r.county.toLowerCase().includes(county.toLowerCase()));
    if (city) rows = rows.filter((r) => r.city.toLowerCase().includes(city.toLowerCase()));
    if (zip) rows = rows.filter((r) => r.zip === zip);
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.schoolName} ${r.city} ${r.state} ${r.county} ${r.zip} ${r.website}`.toLowerCase();
        if (hay.includes(q)) return true;
        return r.contacts.some((c) =>
          `${c.fullName} ${c.title} ${c.email}`.toLowerCase().includes(q),
        );
      });
    }

    const states = Array.from(new Set(orgs.map((o) => norm(o.state)).filter(Boolean))).sort();
    const counties = Array.from(new Set(rows.map((r) => norm(r.county)).filter(Boolean))).sort();
    const cities = Array.from(new Set(rows.map((r) => norm(r.city)).filter(Boolean))).sort();

    return NextResponse.json({
      items: rows,
      filters: { states, counties, cities },
      total: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load schools" },
      { status: 500 },
    );
  }
}
