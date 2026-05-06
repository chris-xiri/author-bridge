import { NextResponse } from "next/server";
import { listContacts, listOrganizations, saveContacts, saveOrganizations } from "@/lib/sheets";

function titleCase(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isUrlLikeName(name: string) {
  const n = (name || "").trim().toLowerCase();
  return !n || /^https?:\/\//.test(n) || /^[\w.-]+\.[a-z]{2,}/.test(n);
}

function deriveSchoolNameFromUrl(rawUrl: string) {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const labels = host.split(".");
    const first = labels[0] ?? "";
    const codeMap: Record<string, string> = {
      hs: "High School",
      hss: "High School South",
      hsn: "High School North",
      ms: "Middle School",
      sms: "South Middle School",
      nms: "North Middle School",
      es: "Elementary School",
      ps: "Primary School",
    };
    if (codeMap[first]) return codeMap[first];
    const cleaned = first
      .replace(/[-_]+/g, " ")
      .replace(/\b(k12|usd|isd|csd|schools?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 3) return titleCase(cleaned);
    return "";
  } catch {
    return "";
  }
}

function normalizeSchoolName(rawName: string) {
  const n = (rawName || "").replace(/\s+/g, " ").trim();
  if (!n) return "";
  if (isUrlLikeName(n)) return "";
  if (/^about(\s+our)?\s+library$/i.test(n)) return "";
  if (/^library$/i.test(n)) return "";
  if (/^sites?$/i.test(n)) return "";
  if (/^elementary school$|^middle school$|^high school$/i.test(n)) return "";
  if (/\borg$/i.test(n) && !/\s/.test(n)) return "";
  return n;
}

function deriveSchoolNameFromEmail(email: string) {
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  if (!domain) return "";
  if (domain.includes("greatneck.k12.ny.us")) return "Great Neck Public Schools";
  if (domain.includes("roslynschools.org")) return "Roslyn Schools";
  if (domain.includes("manhassetschools.org")) return "Manhasset Schools";
  return "";
}

function deriveSpecificSchoolFromText(rawText: string) {
  const t = rawText.toLowerCase();
  if (!t) return "";
  const patterns: Array<{ rx: RegExp; label: string }> = [
    { rx: /great\s+neck\s+south\s+high\s+school|south\s+high\s+school|\/shs\/|\bshs\b/, label: "Great Neck South High School" },
    { rx: /great\s+neck\s+north\s+high\s+school|north\s+high\s+school|\/nhs\/|\bnhs\b/, label: "Great Neck North High School" },
    { rx: /south\s+middle\s+school|\/sms\/|\bsms\b/, label: "South Middle School" },
    { rx: /north\s+middle\s+school|\/nms\/|\bnms\b/, label: "North Middle School" },
    { rx: /middle\s+school/, label: "Middle School" },
    { rx: /high\s+school/, label: "High School" },
    { rx: /elementary\s+school|primary\s+school/, label: "Elementary School" },
  ];
  for (const p of patterns) {
    if (p.rx.test(t)) return p.label;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const [orgs, contacts] = await Promise.all([listOrganizations(), listContacts()]);
    const contactByOrg = new Map<string, (typeof contacts)[number]>();
    for (const c of contacts) {
      if (!contactByOrg.has(c.orgId)) contactByOrg.set(c.orgId, c);
    }

    let orgUpdated = 0;
    for (const org of orgs) {
      if (!isUrlLikeName(org.name)) continue;
      const contact = contactByOrg.get(org.id);
      const derived =
        deriveSchoolNameFromUrl(contact?.sourceUrl ?? "") ||
        deriveSchoolNameFromUrl(org.website ?? "");
      if (!derived) continue;
      org.name = derived;
      org.updatedAt = new Date().toISOString();
      orgUpdated += 1;
    }

    const orgById = new Map(orgs.map((o) => [o.id, o]));
    let contactUpdated = 0;
    const samples: Array<{ id: string; before: string; after: string; name: string; email: string }> = [];
    for (const c of contacts) {
      const manual = normalizeSchoolName(c.schoolName);
      const orgName = normalizeSchoolName(orgById.get(c.orgId)?.name ?? "");
      const specific = deriveSpecificSchoolFromText(`${c.sourceUrl} ${c.evidence ?? ""} ${orgById.get(c.orgId)?.website ?? ""}`);
      const fromUrl = deriveSchoolNameFromUrl(c.sourceUrl) || deriveSchoolNameFromUrl(orgById.get(c.orgId)?.website ?? "");
      const fromEmail = deriveSchoolNameFromEmail(c.email);
      const nextSchoolName = normalizeSchoolName(specific || fromUrl || manual || orgName || fromEmail);
      if (!nextSchoolName) continue;
      if ((c.schoolName ?? "").trim() === nextSchoolName) continue;
      if (samples.length < 40) {
        samples.push({
          id: c.id,
          before: c.schoolName ?? "",
          after: nextSchoolName,
          name: c.fullName,
          email: c.email,
        });
      }
      c.schoolName = nextSchoolName;
      c.updatedAt = new Date().toISOString();
      contactUpdated += 1;
    }

    if (!dryRun && orgUpdated > 0) {
      await saveOrganizations(orgs);
    }
    if (!dryRun && contactUpdated > 0) {
      await saveContacts(contacts);
    }
    return NextResponse.json({
      ok: true,
      dryRun,
      orgUpdated,
      contactUpdated,
      totalOrgs: orgs.length,
      totalContacts: contacts.length,
      samples,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Backfill failed" },
      { status: 500 },
    );
  }
}
