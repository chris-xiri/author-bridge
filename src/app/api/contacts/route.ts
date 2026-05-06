import { NextRequest, NextResponse } from "next/server";
import { listContacts, listOrganizations } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    const campaign = params.get("campaign");
    const confidence = params.get("confidence");
    const roleBucket = params.get("roleBucket");
    const page = Number(params.get("page") ?? "1");
    const pageSize = 25;

    const [allContacts, orgs] = await Promise.all([listContacts(), listOrganizations()]);
    const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));

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

    function normalizeSchoolName(rawName: string) {
      const n = (rawName || "").replace(/\s+/g, " ").trim();
      if (!n) return "";
      if (isUrlLikeName(n)) return "";
      if (/^about(\s+our)?\s+library$/i.test(n)) return "";
      if (/^library$/i.test(n)) return "";
      return n;
    }

    function deriveSchoolNameFromUrl(rawUrl: string) {
      if (!rawUrl) return "";
      try {
        const u = new URL(rawUrl);
        const host = u.hostname.replace(/^www\./i, "").toLowerCase();
        const platformHosts = new Set([
          "sites.google.com",
          "docs.google.com",
          "drive.google.com",
          "google.com",
        ]);
        const path = u.pathname.toLowerCase();
        const pathCodeMap: Record<string, string> = {
          "/shs/": "South High School",
          "/nhs/": "North High School",
          "/hs/": "High School",
          "/sms/": "South Middle School",
          "/nms/": "North Middle School",
          "/ms/": "Middle School",
          "/es/": "Elementary School",
        };
        for (const [needle, label] of Object.entries(pathCodeMap)) {
          if (path.includes(needle)) return label;
        }
        if (platformHosts.has(host)) return "";
        const labels = host.split(".");
        const first = labels[0] ?? "";
        const codeMap: Record<string, string> = {
          hs: "High School",
          shs: "South High School",
          nhs: "North High School",
          hss: "High School South",
          hsn: "High School North",
          ms: "Middle School",
          sms: "South Middle School",
          nms: "North Middle School",
          es: "Elementary School",
          ps: "Primary School",
        };
        if (codeMap[first]) return codeMap[first];
        if (/^[a-z]{2,6}$/.test(first)) {
          const pathHints = u.pathname.toLowerCase();
          if (pathHints.includes("middle")) return `${first.toUpperCase()} Middle School`;
          if (pathHints.includes("high")) return `${first.toUpperCase()} High School`;
        }
        const cleaned = first
          .replace(/[-_]+/g, " ")
          .replace(/\b(k12|usd|isd|csd|schools?)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned.length >= 3) {
          const cased = titleCase(cleaned);
          if (!/(com|org|net|sites)$/i.test(cased)) return cased;
        }
        return titleCase(host.replace(/\./g, " "));
      } catch {
        return "";
      }
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

    function isGenericSchoolLabel(label: string) {
      const v = (label || "").toLowerCase().trim();
      return v === "high school" || v === "middle school" || v === "elementary school";
    }

    function isLikelyNonPersonName(name: string) {
      const n = (name || "").trim().toLowerCase();
      return !n || n === "email us" || n === "contact us" || n === "staff";
    }

    let contacts = allContacts.map((c) => ({
      ...c,
      schoolName: "",
    }));
    contacts = contacts
      .filter((c) => !isLikelyNonPersonName(c.fullName))
      .map((c) => {
        const manualSchoolName = normalizeSchoolName(c.schoolName ?? "");
        const orgName = normalizeSchoolName(orgNameById.get(c.orgId) ?? "");
        const org = orgById.get(c.orgId);
        const specificFromText = deriveSpecificSchoolFromText(
          `${c.sourceUrl} ${c.evidence ?? ""} ${orgName} ${org?.website ?? ""} ${org?.sourceUrl ?? ""}`,
        );
        const urlSchool = deriveSchoolNameFromUrl(c.sourceUrl);
        const orgUrlSchool = deriveSchoolNameFromUrl(orgById.get(c.orgId)?.website ?? "");
        const emailSchool = deriveSchoolNameFromEmail(c.email);
        // Prefer specific school; if only generic school label exists, prefer district/domain mapping.
        const specificOrUrl = specificFromText || urlSchool;
        const derived = isGenericSchoolLabel(specificOrUrl) ? (emailSchool || specificOrUrl) : (specificOrUrl || orgName || orgUrlSchool || emailSchool);
        const schoolName = manualSchoolName || derived;
        return { ...c, schoolName };
      });
    if (status) contacts = contacts.filter((c) => c.status === status);
    if (campaign) contacts = contacts.filter((c) => c.campaignId === campaign);
    if (confidence) contacts = contacts.filter((c) => c.confidence === confidence);
    if (roleBucket) contacts = contacts.filter((c) => c.roleBucket === roleBucket);
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
