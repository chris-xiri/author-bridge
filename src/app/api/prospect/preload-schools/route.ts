import { NextResponse } from "next/server";
import { z } from "zod";
import { beginCrmBatch, flushCrmBatch, upsertOrganization } from "@/lib/crm";
import { searchSerpApi } from "@/lib/prospect";
import JSZip from "jszip";
import { parse } from "csv-parse/sync";

const bodySchema = z.object({
  geoTargets: z.array(z.string().min(1)).optional().default([]),
  stateCodes: z.array(z.string().length(2)).optional().default([]),
  includePublic: z.boolean().optional(),
  includePrivate: z.boolean().optional(),
  maxResultsPerQuery: z.number().int().min(5).max(100).optional(),
  mode: z.enum(["serp", "national"]).optional().default("national"),
  maxRecords: z.number().int().min(100).max(200000).optional().default(50000),
});

const DEFAULT_MAX_RESULTS = 30;
const MAX_QUERIES = 24;
const NCES_PUBLIC_ZIP_URL = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2425_w_0a_051425.zip";
const NCES_PUBLIC_CSV_NAME = "ccd_sch_029_2425_w_0a_051425.csv";
const PSS_PRIVATE_ZIP_URL = "https://nces.ed.gov/surveys/pss/zip/pss2122_pu_csv.zip";
const PSS_PRIVATE_SOURCE_YEAR = "2021-22";

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractSchoolName(title: string) {
  const raw = normalizeSpaces(
    title
      .replace(/\s*[|-]\s*.*$/, "")
      .replace(/\b(Home|Homepage|Official Site)\b/gi, "")
      .trim(),
  );
  if (!raw) return "";
  const patterns = [
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,8}\s(?:Elementary|Middle|Junior|Senior|High|Primary|Intermediate)\sSchool)\b/,
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,8}\s(?:Academy|Preparatory School|Prep School))\b/,
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,8}\s(?:University|College))\b/,
    /\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,8}\sSchool)\b/,
  ];
  for (const rx of patterns) {
    const m = raw.match(rx);
    if (m?.[1]) return normalizeSpaces(m[1]);
  }
  return "";
}

function isLikelySchoolResult(item: { title: string; link: string; snippet?: string }) {
  const hay = `${item.title} ${item.link} ${item.snippet ?? ""}`.toLowerCase();
  const hasSchoolSignal = /(school|k12|academy|district|elementary|middle|high|private school)/.test(hay);
  const noisy = /(jobs?|hiring|salary|zillow|realtor|greatschools|niche\.com\/k12|wikipedia|mapquest)/.test(hay);
  return hasSchoolSignal && !noisy;
}

function parseGeo(geo: string) {
  const parts = geo.split(",").map((v) => v.trim()).filter(Boolean);
  const city = parts[0] ?? "";
  const state = parts[1] ?? "";
  return { city, state };
}

function normalizeStateCode(value: string) {
  return value.trim().toUpperCase();
}

function inferLevelFromName(name: string): "elementary" | "middle" | "high" | "university" | "unknown" {
  const s = name.toLowerCase();
  if (/(elementary|primary|intermediate|grade school)/.test(s)) return "elementary";
  if (/(middle|junior high|jr high)/.test(s)) return "middle";
  if (/(high school|senior high|secondary school|prep)/.test(s)) return "high";
  if (/(university|college)/.test(s)) return "university";
  return "unknown";
}

function isGenericOrDistrictName(name: string) {
  const s = normalizeSpaces(name).toLowerCase();
  if (!s) return true;
  if (/^(public school|school|about .+ school|sites?)$/.test(s)) return true;
  if (/(union free school|school district|public schools|department of education|central school district|independent school district)/.test(s)) return true;
  if (/^great neck union free school$/i.test(s)) return true;
  return false;
}

function isDistrictLikeSchoolName(schoolName: string, leaName: string) {
  const sn = normalizeSpaces(schoolName).toLowerCase();
  const ln = normalizeSpaces(leaName).toLowerCase();
  if (!sn) return true;
  if (ln && sn === ln) return true;
  if (ln && (sn.includes("school district") || sn.includes("public schools") || sn.includes("union free school"))) {
    return true;
  }
  return false;
}

async function runNationalPublicSchoolImport(input: z.infer<typeof bodySchema>) {
  const requestedStates = (input.stateCodes ?? []).map(normalizeStateCode).filter(Boolean);
  const maxRecords = input.maxRecords ?? 50000;
  const response = await fetch(NCES_PUBLIC_ZIP_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public school preload source unavailable (${response.status})`);
  }
  const zipFile = await JSZip.loadAsync(await response.arrayBuffer());
  const csvEntry = zipFile.file(NCES_PUBLIC_CSV_NAME);
  if (!csvEntry) {
    throw new Error("Public school preload failed: csv file missing in NCES archive.");
  }
  const csv = await csvEntry.async("string");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
  const seen = new Set<string>();
  let scannedResults = 0;
  let schoolsCreatedOrUpdated = 0;
  const sampleSchools: string[] = [];

  beginCrmBatch();
  try {
    for (const row of rows) {
      if (scannedResults >= maxRecords) break;
      scannedResults += 1;
      if ((row.SY_STATUS ?? "") !== "1") continue;
      const state = normalizeStateCode(row.MSTATE ?? row.LSTATE ?? "");
      if (!state) continue;
      if (requestedStates.length && !requestedStates.includes(state)) continue;
      const schoolName = normalizeSpaces(row.SCH_NAME ?? "");
      if (!schoolName) continue;
      if (isGenericOrDistrictName(schoolName)) continue;
      if (isDistrictLikeSchoolName(schoolName, row.LEA_NAME ?? "")) continue;
      const city = normalizeSpaces(row.MCITY ?? row.LCITY ?? "");
      const ncessch = normalizeSpaces(row.NCESSCH ?? "");
      const uid = `${ncessch}|${schoolName}|${city}|${state}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const link = ncessch ? `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${ncessch}` : "";
      const levelText = normalizeSpaces(row.LEVEL ?? "");
      const level =
        /elementary/i.test(levelText) ? "elementary" :
        /middle/i.test(levelText) ? "middle" :
        /high/i.test(levelText) ? "high" : inferLevelFromName(schoolName);
      const address = normalizeSpaces([row.MSTREET1, row.MSTREET2, row.MSTREET3].filter(Boolean).join(" "));
      const zipCode = normalizeSpaces(row.MZIP ?? row.LZIP ?? "");
      const county = normalizeSpaces(row.PCNTNM ?? "");
      const grades = `${normalizeSpaces(row.GSLO ?? "")}-${normalizeSpaces(row.GSHI ?? "")}`.replace(/^-|-$/g, "");
      const org = await upsertOrganization({
        name: schoolName,
        libraryType: "school",
        schoolLevel: level,
        website: link,
        address,
        city,
        state,
        zip: zipCode,
        county,
        phone: normalizeSpaces(row.PHONE ?? ""),
        grades,
        sourceQuery: "NCES CCD 2024-25 public schools",
        sourceUrl: link || NCES_PUBLIC_ZIP_URL,
      });
      if (org) {
        schoolsCreatedOrUpdated += 1;
        if (sampleSchools.length < 25) sampleSchools.push(`${schoolName} (${level}) | ${address} ${city}, ${state} ${zipCode}`.trim());
      }
    }
  } finally {
    await flushCrmBatch();
  }

  return {
    ok: true,
    mode: "national",
    provider: "nces-ccd-public-direct",
    year: "2024-25",
    includesPrivate: false,
    note: "Public schools were loaded directly from NCES CCD zip/csv source.",
    schoolsCreatedOrUpdated,
    scannedResults,
    queryCount: 1,
    failedQueries: [] as string[],
    sampleSchools,
  };
}

async function runNationalPrivateSchoolImport(input: z.infer<typeof bodySchema>) {
  const requestedStates = (input.stateCodes ?? []).map(normalizeStateCode).filter(Boolean);
  const maxRecords = input.maxRecords ?? 50000;
  const response = await fetch(PSS_PRIVATE_ZIP_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Private school preload source unavailable (${response.status})`);
  }
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const csvEntry = zip.file("pss2122_pu.csv");
  if (!csvEntry) {
    throw new Error("Private school preload failed: csv file missing in NCES archive.");
  }
  const csv = await csvEntry.async("string");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];

  let scannedResults = 0;
  let schoolsCreatedOrUpdated = 0;
  const sampleSchools: string[] = [];
  const seen = new Set<string>();

  beginCrmBatch();
  try {
    for (const row of rows) {
      if (scannedResults >= maxRecords) break;
      scannedResults += 1;
      const state = normalizeStateCode(row.PSTABB ?? "");
      if (!state) continue;
      if (requestedStates.length && !requestedStates.includes(state)) continue;

      const schoolName = normalizeSpaces(row.PINST ?? "");
      if (!schoolName) continue;
      if (isGenericOrDistrictName(schoolName)) continue;
      const city = normalizeSpaces(row.PCITY ?? "");
      const uid = `${schoolName}|${city}|${state}`;
      if (seen.has(uid)) continue;
      seen.add(uid);

      const ppin = normalizeSpaces(row.PPIN ?? "");
      const link = ppin ? `https://nces.ed.gov/surveys/pss/privateschoolsearch/school_detail.asp?Search=1&SchoolID=${ppin}` : "";
      const org = await upsertOrganization({
        name: schoolName,
        libraryType: "school",
        schoolLevel: inferLevelFromName(schoolName),
        website: link,
        city,
        state,
        sourceQuery: `NCES PSS ${PSS_PRIVATE_SOURCE_YEAR} private schools`,
        sourceUrl: link || PSS_PRIVATE_ZIP_URL,
      });
      if (org) {
        schoolsCreatedOrUpdated += 1;
        if (sampleSchools.length < 25) sampleSchools.push(`${schoolName} | ${city}, ${state}`);
      }
    }
  } finally {
    await flushCrmBatch();
  }

  return {
    ok: true,
    mode: "national",
    provider: "nces-pss-private",
    year: PSS_PRIVATE_SOURCE_YEAR,
    includesPrivate: true,
    schoolsCreatedOrUpdated,
    scannedResults,
    queryCount: 1,
    failedQueries: [] as string[],
    sampleSchools,
  };
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    if (input.mode === "national") {
      const publicResult = await runNationalPublicSchoolImport(input);
      const privateResult = await runNationalPrivateSchoolImport(input);
      return NextResponse.json({
        ok: true,
        mode: "national",
        provider: "nces-ccd-public+nces-pss-private",
        includesPrivate: true,
        schoolsCreatedOrUpdated:
          (publicResult.schoolsCreatedOrUpdated ?? 0) + (privateResult.schoolsCreatedOrUpdated ?? 0),
        scannedResults: (publicResult.scannedResults ?? 0) + (privateResult.scannedResults ?? 0),
        queryCount: (publicResult.queryCount ?? 0) + (privateResult.queryCount ?? 0),
        failedQueries: [...(publicResult.failedQueries ?? []), ...(privateResult.failedQueries ?? [])],
        sampleSchools: [...(publicResult.sampleSchools ?? []).slice(0, 12), ...(privateResult.sampleSchools ?? []).slice(0, 13)],
        sources: {
          public: publicResult,
          private: privateResult,
        },
      });
    }

    const maxResults = input.maxResultsPerQuery ?? DEFAULT_MAX_RESULTS;
    const includePublic = input.includePublic ?? true;
    const includePrivate = input.includePrivate ?? true;
    const modes = [
      ...(includePublic ? ["public schools", "school district schools"] : []),
      ...(includePrivate ? ["private schools", "independent schools"] : []),
    ];
    if (!modes.length) {
      return NextResponse.json({ error: "Enable at least one school type (public or private)." }, { status: 400 });
    }

    let queryCount = 0;
    let scannedResults = 0;
    let schoolsCreatedOrUpdated = 0;
    const failedQueries: string[] = [];
    const seenLinks = new Set<string>();
    const sampleSchools: string[] = [];

    beginCrmBatch();
    try {
      for (const geo of input.geoTargets) {
      for (const mode of modes) {
        if (queryCount >= MAX_QUERIES) break;
        const query = `${geo} ${mode}`.trim();
        queryCount += 1;
        let results: Awaited<ReturnType<typeof searchSerpApi>> = [];
        try {
          results = await searchSerpApi(query, maxResults);
        } catch {
          failedQueries.push(query);
          continue;
        }
        for (const item of results) {
          if (!item.link || seenLinks.has(item.link)) continue;
          seenLinks.add(item.link);
          scannedResults += 1;
          if (!isLikelySchoolResult(item)) continue;
          const schoolName = extractSchoolName(item.title);
          if (!schoolName) continue;
          const { city, state } = parseGeo(geo);
          const row = await upsertOrganization({
            name: schoolName,
            libraryType: "school",
            website: item.link,
            city,
            state,
            sourceQuery: query,
            sourceUrl: item.link,
          });
          if (row) {
            schoolsCreatedOrUpdated += 1;
            if (sampleSchools.length < 25) sampleSchools.push(`${schoolName} | ${item.link}`);
          }
        }
      }
        if (queryCount >= MAX_QUERIES) break;
      }
    } finally {
      await flushCrmBatch();
    }

    return NextResponse.json({
      ok: true,
      mode: "serp",
      schoolsCreatedOrUpdated,
      scannedResults,
      queryCount,
      failedQueries,
      sampleSchools,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "School preload failed" },
      { status: 500 },
    );
  }
}
