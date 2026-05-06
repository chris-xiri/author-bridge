import { NextResponse } from "next/server";
import { z } from "zod";
import { searchSerpApi } from "@/lib/prospect";

const bodySchema = z.object({
  county: z.string().min(3),
  state: z.string().min(2).max(2),
});

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bSt\b/g, "St")
    .replace(/\bMt\b/g, "Mt");
}

function extractTowns(text: string, state: string) {
  const clean = normalize(text.replace(/[()]/g, " "));
  const tokens = clean.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) ?? [];
  const out = new Set<string>();
  for (const token of tokens) {
    const t = normalize(token);
    if (t.length < 3) continue;
    if (/County|School|District|Public|Private|Department|Library|Board|State|City of/.test(t)) continue;
    if (/List|Map|Top|Best|Home|Official/.test(t)) continue;
    out.add(`${titleCase(t)}, ${state.toUpperCase()}`);
    if (out.size >= 60) break;
  }
  return Array.from(out);
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { county, state } = parsed.data;
    const queries = [
      `towns in ${county}, ${state}`,
      `villages in ${county}, ${state}`,
      `school districts in ${county}, ${state}`,
    ];
    const all: string[] = [];
    const samples: string[] = [];
    for (const q of queries) {
      try {
        const results = await searchSerpApi(q, 10);
        for (const r of results) {
          if (samples.length < 10) samples.push(`${r.title} | ${r.link}`);
          const combined = `${r.title}. ${r.snippet ?? ""}`;
          all.push(...extractTowns(combined, state));
        }
      } catch {
        // Ignore individual query failures.
      }
    }
    const towns = Array.from(new Set(all)).slice(0, 60);
    return NextResponse.json({ towns, samples });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate county towns" },
      { status: 500 },
    );
  }
}

