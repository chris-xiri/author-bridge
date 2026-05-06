import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyRoleBucket, extractContactsFromHtml, inferSchoolLevel, isLikelyGenericMailbox, isNameAlignedWithEmail, isNamePlausible, validateDeterministicContact } from "@/lib/contact-extractor";
import { extractContactsWithAi, inferOrganizationNameWithAi } from "@/lib/ai-extractor";
import { beginCrmBatch, flushCrmBatch, upsertContact, upsertOrganization } from "@/lib/crm";
import { fetchPage, findStaffLikeLinks, searchSerpApi } from "@/lib/prospect";
import { createId, nowIso } from "@/lib/utils";
import type { ProspectRunInput } from "@/lib/types";
import { ensureSheetSchema, listContacts, saveContacts } from "@/lib/sheets";

const bodySchema = z.object({
  campaignName: z.string().min(1),
  geoTargets: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(1),
  maxResultsPerQuery: z.number().int().min(5).max(100).optional(),
  includeTerms: z.array(z.string()).optional(),
  excludeTerms: z.array(z.string()).optional(),
  schoolLevels: z.array(z.enum(["elementary", "middle", "high", "university", "unknown"])).optional(),
  strictGeo: z.boolean().optional(),
  schoolsOnly: z.boolean().optional(),
});

const DEFAULT_MAX_RESULTS_PER_QUERY = 50;
const DEFAULT_MAX_QUERIES_PER_RUN = 24;
const MAX_SERP_CANDIDATES_PER_QUERY = 8;
const MAX_PAGE_FETCHES_PER_RUN = 45;

function geoTokensFromTarget(geo: string) {
  return geo
    .toLowerCase()
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !["new", "york", "city"].includes(t));
}

function scoreGeoRelevance(item: { title: string; link: string; snippet?: string }, tokens: string[]) {
  const hay = `${item.title} ${item.link} ${item.snippet ?? ""}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  if (/k12|schools?\.org|school|library/.test(hay)) score += 2;
  if (/hs\.|ms\.|es\.|district/.test(hay)) score += 1;
  return score;
}

function extractH1Title(html: string) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeOrgName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .replace(/\|\s*.*$/, "")
    .replace(/-\s*home$/i, "")
    .trim();
}

function isWeakOrgName(name: string) {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (/^about(\s+our)?\s+library$/.test(n)) return true;
  if (n === "library" || n === "home") return true;
  if (/^[\w.-]+\.[a-z]{2,}$/.test(n)) return true;
  return false;
}

function isSchoolEmailDomain(domain: string) {
  const d = domain.toLowerCase();
  if (!d) return false;
  if (/(k12|schools?|school|usd|isd|csd|edu)/.test(d)) return true;
  return false;
}

function getHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bK12\b/g, "K12");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanupSchoolName(value: string) {
  return normalizeWhitespace(
    value
      .replace(/[_|]/g, " ")
      .replace(/\.(org|com|net|edu|us)$/i, "")
      .replace(/\b(k12|ny)\b/gi, " ")
      .replace(/\s{2,}/g, " "),
  );
}

function looksLikeDistrictName(value: string) {
  return /(school district|public schools|central school district|\bdistrict\b)/i.test(value);
}

function isGenericSchoolName(value: string) {
  const v = normalizeWhitespace(value).toLowerCase();
  if (!v) return true;
  if (v.length < 6) return true;
  if (/^about( our)? library$/.test(v)) return true;
  if (/^sites?$/.test(v)) return true;
  if (/^elementary school$|^middle school$|^high school$|^primary school$/.test(v)) return true;
  if (/\b(org|website|homepage)\b/.test(v)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return true;
  return false;
}

function extractSchoolFromText(text: string) {
  const cleaned = normalizeWhitespace(text);
  const patterns = [
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,6}\s(?:Elementary|Middle|Junior|Senior|High|Primary|Intermediate)\sSchool)\b/,
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,7}\s(?:University|College))\b/,
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,4}\sSchool)\b/,
  ];
  for (const pattern of patterns) {
    const m = cleaned.match(pattern);
    if (m?.[1]) return cleanupSchoolName(m[1]);
  }
  return "";
}

function inferSchoolFromHost(host: string) {
  const lower = host.toLowerCase();
  const parts = lower.split(".");
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  const districtStem = second && !["k12", "schools", "school"].includes(second) ? second : first;
  const district = districtStem ? toTitleCase(districtStem.replace(/[-_]/g, " ")) : "";
  if (/^hs$|highschool/.test(first) && district) return `${district} High School`;
  if (/^ms$|middleschool|jrhs/.test(first) && district) return `${district} Middle School`;
  if (/^es$|elementary/.test(first) && district) return `${district} Elementary School`;
  return "";
}

function resolveBestSchoolName(input: {
  orgName: string;
  pageTitle: string;
  sourceUrl: string;
  evidence: string;
  email: string;
}) {
  const candidates: string[] = [];
  const fromText = extractSchoolFromText(`${input.pageTitle} ${input.evidence}`);
  if (fromText) candidates.push(fromText);
  const host = getHost(input.sourceUrl) || (input.email.split("@")[1] ?? "");
  const fromHost = inferSchoolFromHost(host);
  if (fromHost) candidates.push(fromHost);
  const cleanedOrg = cleanupSchoolName(input.orgName);
  if (cleanedOrg && !looksLikeDistrictName(cleanedOrg)) candidates.push(cleanedOrg);
  for (const candidate of candidates) {
    const normalized = toTitleCase(cleanupSchoolName(candidate));
    if (!isGenericSchoolName(normalized) && !looksLikeDistrictName(normalized)) {
      return normalized;
    }
  }
  return "";
}

function levelLabelForQuery(level: string) {
  if (level === "elementary") return "Elementary School";
  if (level === "middle") return "Middle School";
  if (level === "high") return "High School";
  if (level === "university") return "University";
  return "";
}

function stateCodeFromGeo(geo: string) {
  const parts = geo.split(",").map((v) => v.trim()).filter(Boolean);
  const last = (parts[parts.length - 1] ?? "").toUpperCase();
  const m = last.match(/\b([A-Z]{2})\b/);
  return m?.[1] ?? "";
}

export async function POST(req: Request) {
  try {
    beginCrmBatch();
    const startedAt = Date.now();
    const SOFT_RUNTIME_MS = 62_000;
    const isOutOfTime = () => Date.now() - startedAt > SOFT_RUNTIME_MS;
    await ensureSheetSchema();
    const existingContacts = await listContacts();
    const knownEmails = new Set(existingContacts.map((c) => c.email.toLowerCase()).filter(Boolean));
    const existingByEmail = new Map(existingContacts.map((c) => [c.email.toLowerCase(), c]));
    let existingMutated = false;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input: ProspectRunInput = parsed.data;
    const maxResultsPerQuery = (parsed.data as { maxResultsPerQuery?: number }).maxResultsPerQuery ?? DEFAULT_MAX_RESULTS_PER_QUERY;
    const maxQueriesPerRun = Math.max(DEFAULT_MAX_QUERIES_PER_RUN, input.geoTargets.length * 2);
    const strictGeo = Boolean((parsed.data as { strictGeo?: boolean }).strictGeo ?? true);
    const schoolsOnly = Boolean((parsed.data as { schoolsOnly?: boolean }).schoolsOnly ?? true);
    const runId = createId("run");
    let discoveredCount = 0;
    let queuedForReviewCount = 0;
    const failedUrls: string[] = [];
    let queryCount = 0;
    let resultCount = 0;
    let extractedCount = 0;
    let levelFilteredCount = 0;
    let roleFilteredCount = 0;
    let confidenceFilteredCount = 0;
    let includeExcludeFilteredCount = 0;
    let schoolsOnlyFilteredCount = 0;
    let nameValidationFilteredCount = 0;
    let serpRejectedCount = 0;
    let aiExtractedCount = 0;
    let deterministicAcceptedCount = 0;
    let aiOrgNameUsedCount = 0;
    let deterministicCandidateCount = 0;
    let aiCandidateCount = 0;
    let aiRejectedByGenericMailbox = 0;
    let aiRejectedByConfidence = 0;
    let acceptedFromDeterministic = 0;
    let acceptedFromAi = 0;
    let timedOut = false;
    let pageFetchCount = 0;
    let discoveredSchoolCount = 0;
    let schoolsWithoutContactCount = 0;
    let recoveredSchoolContactCount = 0;
    const failedQueries: string[] = [];
    const executedQueries: string[] = [];
    const schoolsOnlyFilteredSamples: string[] = [];
    const serpRejectedSamples: string[] = [];
    const noisyDomains = ["indeed.com", "ziprecruiter.com", "simplyhired.com", "olasjobs.org", "glassdoor.com", "salary.com"];
    const includeTerms = (input.includeTerms ?? ["librarian", "library media specialist"]).map((v) =>
      v.toLowerCase().trim(),
    );
    const excludeTerms = (input.excludeTerms ?? ["principal"]).map((v) => v.toLowerCase().trim());
    const allowedLevels = input.schoolLevels ?? ["elementary", "middle", "high", "university"];
    const levelQueryMap: Record<string, string[]> = {
      elementary: ["elementary school", "primary school"],
      middle: ["middle school", "junior high"],
      high: ["high school", "secondary school"],
      university: ["university", "college", "campus library"],
      unknown: [],
    };

    const keywords = input.keywords.length ? input.keywords : ["school librarian"];
    const queryPlan: Array<{ geo: string; kw: string }> = [];
    const seenResultLinks = new Set<string>();
    const runOrganizations = new Map<string, { id: string; name: string; website: string; sourceQuery: string }>();
    const perGeoStats = new Map<
      string,
      { queries: number; serpResults: number; extracted: number; accepted: number; failedQueries: number }
    >();
    const orgIdsWithContacts = new Set(existingContacts.map((c) => c.orgId).filter(Boolean));
    const schoolQuerySeeds = ["Library Media Specialist", "Librarian"];
    const selectedLevels = allowedLevels.filter(
      (l) => l === "middle" || l === "high" || l === "elementary" || l === "university",
    );
    const focusedLevels = schoolsOnly
      ? selectedLevels.filter((l) => l !== "university")
      : selectedLevels;
    // Round-robin by town first so each geo target gets coverage before deeper expansion.
    for (const level of focusedLevels) {
      const levelLabel = levelLabelForQuery(level);
      if (!levelLabel) continue;
      for (const geo of input.geoTargets) {
        const stateCode = stateCodeFromGeo(geo);
        const k12DomainHint = stateCode ? `site:k12.${stateCode.toLowerCase()}.us` : "site:k12.us";
        for (const seed of schoolQuerySeeds) {
          queryPlan.push({ geo, kw: `${seed} ${levelLabel} -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas` });
          queryPlan.push({ geo, kw: `${seed} ${levelLabel} staff directory -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas` });
          queryPlan.push({ geo, kw: `${seed} ${levelLabel} ${k12DomainHint} -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas` });
          queryPlan.push({ geo, kw: `${seed} ${levelLabel} site:schools.org -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas` });
        }
      }
    }
    for (const geo of input.geoTargets) {
      for (const kw of keywords) queryPlan.push({ geo, kw });
    }

    for (const step of queryPlan) {
      if (isOutOfTime()) {
        timedOut = true;
        break;
      }
      if (queryCount >= maxQueriesPerRun) break;
      const geo = step.geo;
      const kw = step.kw;
      if (!perGeoStats.has(geo)) {
        perGeoStats.set(geo, { queries: 0, serpResults: 0, extracted: 0, accepted: 0, failedQueries: 0 });
      }
      const levelTerms = allowedLevels.flatMap((l) => levelQueryMap[l] ?? []);
      const levelHint = levelTerms[0] ?? "";
      const query = `${geo} ${kw}`.trim();
      queryCount += 1;
      executedQueries.push(query);
      perGeoStats.get(geo)!.queries += 1;
      const fallbackQueries = [
        `"Library Media Specialist" "${geo}" "${levelHint}" -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas`.trim(),
        `"Librarian" "${geo}" "${levelHint}" -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas`.trim(),
        `"school library staff" "${geo}" -jobs -job -salary -indeed -ziprecruiter -glassdoor -olas`.trim(),
      ];
      let results: Awaited<ReturnType<typeof searchSerpApi>> = [];
      try {
        results = await searchSerpApi(query, maxResultsPerQuery);
      } catch {
        failedQueries.push(query);
        perGeoStats.get(geo)!.failedQueries += 1;
        continue;
      }
      const candidates = [...results];
      if (candidates.length < Math.max(2, maxResultsPerQuery)) {
        for (const fallbackQuery of fallbackQueries) {
          if (isOutOfTime()) {
            timedOut = true;
            break;
          }
          try {
            const fallback = await searchSerpApi(fallbackQuery, maxResultsPerQuery);
            for (const f of fallback) {
              if (!candidates.find((c) => c.link === f.link)) candidates.push(f);
            }
          } catch {
            failedQueries.push(fallbackQuery);
            perGeoStats.get(geo)!.failedQueries += 1;
          }
        }
      }
      const geoTokens = geoTokensFromTarget(geo);
      const ranked = candidates
        .map((item) => ({ item, geoScore: scoreGeoRelevance(item, geoTokens) }))
        .filter((row) => (strictGeo ? row.geoScore > 0 : true))
        .sort((a, b) => b.geoScore - a.geoScore)
        .map((row) => row.item);
      const finalRanked = ranked.length ? ranked : candidates.slice(0, Math.min(candidates.length, 4));
      resultCount += finalRanked.length;
      perGeoStats.get(geo)!.serpResults += finalRanked.length;
      for (const item of finalRanked.slice(0, MAX_SERP_CANDIDATES_PER_QUERY)) {
        if (isOutOfTime()) {
          timedOut = true;
          break;
        }
        if (pageFetchCount >= MAX_PAGE_FETCHES_PER_RUN) {
          timedOut = true;
          break;
        }
        if (!item.link) continue;
        if (seenResultLinks.has(item.link)) continue;
        seenResultLinks.add(item.link);
        const hay = `${item.title} ${item.link} ${item.snippet ?? ""}`.toLowerCase();
        if (schoolsOnly && /public\s+library|library\.org/.test(hay) && !/school|k12|district|schools?\.org/.test(hay)) {
          schoolsOnlyFilteredCount += 1;
          if (schoolsOnlyFilteredSamples.length < 25) schoolsOnlyFilteredSamples.push(`${item.title} | ${item.link}`);
          continue;
        }
        if (noisyDomains.some((d) => hay.includes(d)) || /jobs?|hiring|salary|employment/.test(hay)) {
          serpRejectedCount += 1;
          if (serpRejectedSamples.length < 25) serpRejectedSamples.push(`${item.title} | ${item.link}`);
          continue;
        }
        try {
          const html = await fetchPage(item.link);
          pageFetchCount += 1;
          const h1 = extractH1Title(html);
          let orgName = sanitizeOrgName(item.title || h1 || item.link);
          if (isWeakOrgName(orgName)) {
            const deterministic = sanitizeOrgName(h1);
            if (!isWeakOrgName(deterministic)) {
              orgName = deterministic;
            } else {
              const aiOrgName = sanitizeOrgName(
                await inferOrganizationNameWithAi({
                  html,
                  pageUrl: item.link,
                  pageTitle: item.title ?? "",
                }),
              );
              if (!isWeakOrgName(aiOrgName)) {
                orgName = aiOrgName;
                aiOrgNameUsedCount += 1;
              }
            }
          }
          const pagesToExtract: Array<{ url: string; html: string }> = [{ url: item.link, html }];
          const deepLinks = findStaffLikeLinks(html, item.link);
          const remainingBudget = Math.max(0, MAX_PAGE_FETCHES_PER_RUN - pageFetchCount);
          const deepLinkLimit = Math.min(2, remainingBudget);
          const deepResults = await Promise.allSettled(
            deepLinks.slice(0, deepLinkLimit).map(async (link) => ({ url: link, html: await fetchPage(link) })),
          );
          for (const r of deepResults) {
            if (r.status === "fulfilled") {
              pageFetchCount += 1;
              pagesToExtract.push(r.value);
            }
          }
          const regexExtracted = pagesToExtract.flatMap((p) =>
            extractContactsFromHtml(p.html)
              .map((c) => ({ ...c, sourceUrl: p.url }))
              .filter(validateDeterministicContact),
          );
          deterministicAcceptedCount += regexExtracted.length;
          let aiExtracted = [] as Awaited<ReturnType<typeof extractContactsWithAi>>;
          if (regexExtracted.length === 0) {
            aiExtracted = await extractContactsWithAi({
              html,
              pageUrl: item.link,
              pageTitle: item.title ?? "",
              allowedLevels,
            });
          }
          aiExtractedCount += aiExtracted.length;
          type Candidate = (typeof regexExtracted)[number] & { sourceKind: "deterministic" | "ai" };
          const dedupe = new Map<string, Candidate>();
          for (const row of regexExtracted) {
            const key = row.email.toLowerCase();
            if (!key) continue;
            deterministicCandidateCount += 1;
            dedupe.set(key, { ...row, sourceKind: "deterministic" });
          }
          for (const row of aiExtracted) {
            const key = row.email.toLowerCase();
            if (!key) continue;
            aiCandidateCount += 1;
            if (isLikelyGenericMailbox(row.email)) {
              aiRejectedByGenericMailbox += 1;
              continue;
            }
            if (row.confidence !== "high" && row.confidence !== "medium") {
              aiRejectedByConfidence += 1;
              continue;
            }
            if (!dedupe.has(key)) {
              dedupe.set(key, { ...row, sourceUrl: item.link, sourceKind: "ai" });
            }
          }
          const extracted = Array.from(dedupe.values());
          perGeoStats.get(geo)!.extracted += extracted.length;
          const org = await upsertOrganization({
            name: orgName,
            website: item.link,
            sourceQuery: query,
            sourceUrl: item.link,
            libraryType: /school/i.test(item.title) ? "school" : "public",
          });
          if (!runOrganizations.has(org.id)) {
            runOrganizations.set(org.id, { id: org.id, name: org.name, website: org.website, sourceQuery: query });
            discoveredSchoolCount += 1;
          }
          if (!extracted.length) continue;
          extractedCount += extracted.length;
          for (const found of extracted) {
            const normalizedEmail = (found.email ?? "").toLowerCase();
            if (!normalizedEmail) {
              continue;
            }
            const text = `${found.title} ${found.evidence}`.toLowerCase();
            const searchContext = `${item.title} ${item.snippet ?? ""} ${item.link}`.toLowerCase();
            const hasInclude =
              includeTerms.length === 0 ||
              includeTerms.some((t) => text.includes(t) || searchContext.includes(t));
            const hasExclude = excludeTerms.some((t) => text.includes(t));
            if (knownEmails.has(normalizedEmail)) {
              if (hasExclude) {
                const existing = existingByEmail.get(normalizedEmail);
                if (existing && existing.status === "pending_review") {
                  existing.status = "rejected";
                  existing.updatedAt = nowIso();
                  existingMutated = true;
                }
              }
              continue;
            }
            if (schoolsOnly) {
              const domain = normalizedEmail.split("@")[1] ?? "";
              if (!isSchoolEmailDomain(domain) || /library\.org$/.test(domain)) {
                schoolsOnlyFilteredCount += 1;
                if (schoolsOnlyFilteredSamples.length < 25) schoolsOnlyFilteredSamples.push(found.email);
                continue;
              }
            }
            if (found.confidence !== "high") {
              confidenceFilteredCount += 1;
              continue;
            }
            const namePlausible = isNamePlausible(found.fullName);
            const nameAligned = isNameAlignedWithEmail(found.fullName, found.email);
            const roleSignal = `${found.title} ${found.evidence}`.toLowerCase();
            const hasStrongRoleSignal = /(librarian|library media specialist|school librarian|media specialist)/.test(
              roleSignal,
            );
            if (!namePlausible || (!nameAligned && !hasStrongRoleSignal)) {
              nameValidationFilteredCount += 1;
              continue;
            }
            const srcForLevel = `${item.title} ${item.snippet ?? ""} ${item.link} ${found.evidence}`;
            const schoolLevel = found.schoolLevel === "unknown" ? inferSchoolLevel(srcForLevel) : found.schoolLevel;
            if (!allowedLevels.includes(schoolLevel)) {
              levelFilteredCount += 1;
            }
            const { roleBucket, roleConfidence } = classifyRoleBucket(found.title, found.evidence);
            if (roleBucket === "non_library") {
              roleFilteredCount += 1;
              continue;
            }
            if (!hasInclude || hasExclude) {
              includeExcludeFilteredCount += 1;
              continue;
            }
            discoveredCount += 1;
            const row = await upsertContact({
              orgId: org.id,
              schoolName: resolveBestSchoolName({
                orgName: org.name,
                pageTitle: item.title ?? "",
                sourceUrl: (found as { sourceUrl?: string }).sourceUrl ?? item.link,
                evidence: found.evidence ?? "",
                email: found.email ?? "",
              }),
              fullName: found.fullName,
              title: found.title,
              roleBucket,
              roleConfidence,
              schoolLevel,
              email: found.email,
              phone: found.phone,
              confidence: found.confidence,
              sourceQuery: query,
              sourceUrl: (found as { sourceUrl?: string }).sourceUrl ?? item.link,
              evidence: found.evidence,
            });
            if (row) {
              knownEmails.add(normalizedEmail);
              orgIdsWithContacts.add(org.id);
              queuedForReviewCount += 1;
              perGeoStats.get(geo)!.accepted += 1;
              if (found.sourceKind === "ai") acceptedFromAi += 1;
              else acceptedFromDeterministic += 1;
            }
          }
        } catch {
          failedUrls.push(item.link);
        }
      }
    }

    // Step 2: ensure at least one contact per discovered school/org.
    for (const org of runOrganizations.values()) {
      if (isOutOfTime()) {
        timedOut = true;
        break;
      }
      if (orgIdsWithContacts.has(org.id)) continue;
      schoolsWithoutContactCount += 1;
      const host = getHost(org.website);
      const schoolQueries = [
        `${org.name} library media specialist`.trim(),
        `${org.name} school librarian`.trim(),
        host ? `site:${host} librarian staff` : "",
      ].filter(Boolean);

      let recovered = false;
      for (const schoolQuery of schoolQueries.slice(0, 2)) {
        if (isOutOfTime()) {
          timedOut = true;
          break;
        }
        let schoolResults: Awaited<ReturnType<typeof searchSerpApi>> = [];
        try {
          schoolResults = await searchSerpApi(schoolQuery, 10);
        } catch {
          failedQueries.push(schoolQuery);
          continue;
        }
        for (const item of schoolResults.slice(0, 4)) {
          if (isOutOfTime()) {
            timedOut = true;
            break;
          }
          if (pageFetchCount >= MAX_PAGE_FETCHES_PER_RUN) {
            timedOut = true;
            break;
          }
          if (!item.link) continue;
          try {
            const html = await fetchPage(item.link);
            pageFetchCount += 1;
            const regexExtracted = extractContactsFromHtml(html).filter(validateDeterministicContact);
            if (!regexExtracted.length) continue;
            for (const found of regexExtracted) {
              const normalizedEmail = (found.email ?? "").toLowerCase();
              if (!normalizedEmail || knownEmails.has(normalizedEmail)) continue;
              const domain = normalizedEmail.split("@")[1] ?? "";
              if (schoolsOnly && !isSchoolEmailDomain(domain)) continue;
              if (found.confidence !== "high") continue;
              const { roleBucket, roleConfidence } = classifyRoleBucket(found.title, found.evidence);
              if (roleBucket === "non_library") continue;
              const schoolLevel = found.schoolLevel === "unknown"
                ? inferSchoolLevel(`${item.title} ${item.snippet ?? ""} ${item.link} ${found.evidence}`)
                : found.schoolLevel;
              const row = await upsertContact({
                orgId: org.id,
                fullName: found.fullName,
                title: found.title,
                roleBucket,
                roleConfidence,
                schoolLevel,
                email: found.email,
                phone: found.phone,
                confidence: found.confidence,
                sourceQuery: schoolQuery,
                sourceUrl: item.link,
                evidence: found.evidence,
                schoolName: resolveBestSchoolName({
                  orgName: org.name,
                  pageTitle: item.title ?? "",
                  sourceUrl: item.link,
                  evidence: found.evidence ?? "",
                  email: found.email ?? "",
                }),
              });
              if (row) {
                knownEmails.add(normalizedEmail);
                orgIdsWithContacts.add(org.id);
                queuedForReviewCount += 1;
                discoveredCount += 1;
                recoveredSchoolContactCount += 1;
                recovered = true;
                break;
              }
            }
          } catch {
            failedUrls.push(item.link);
          }
          if (recovered) break;
        }
        if (recovered) break;
      }
    }

    if (existingMutated) {
      await saveContacts(existingContacts);
    }
    await flushCrmBatch();

    return NextResponse.json({
      runId,
      discoveredCount,
      queuedForReviewCount,
      failedUrls,
      timedOut,
      failedQueries,
      debug: {
        maxQueriesPerRun,
        maxResultsPerQuery,
        pageFetchCount,
        maxPageFetchesPerRun: MAX_PAGE_FETCHES_PER_RUN,
        discoveredSchoolCount,
        schoolsWithoutContactCount,
        recoveredSchoolContactCount,
        queryCount,
        resultCount,
        extractedCount,
        levelFilteredCount,
        roleFilteredCount,
        confidenceFilteredCount,
        includeExcludeFilteredCount,
        schoolsOnlyFilteredCount,
        nameValidationFilteredCount,
        serpRejectedCount,
        aiExtractedCount,
        deterministicAcceptedCount,
        aiOrgNameUsedCount,
        deterministicCandidateCount,
        aiCandidateCount,
        aiRejectedByGenericMailbox,
        aiRejectedByConfidence,
        acceptedFromDeterministic,
        acceptedFromAi,
        allowedLevels,
        schoolsOnlyFilteredSamples,
        serpRejectedSamples,
        failedQueries,
        executedQueries: executedQueries.slice(0, 120),
        perGeoStats: Array.from(perGeoStats.entries()).map(([geo, stats]) => ({ geo, ...stats })),
      },
    });
  } catch (error) {
    try {
      await flushCrmBatch();
    } catch {
      // Ignore secondary flush errors during failure response path.
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prospecting failed" },
      { status: 500 },
    );
  }
}
