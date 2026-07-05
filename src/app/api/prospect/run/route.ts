import { z } from "zod";
import { extractContactsWithAi, inferOrganizationNameWithAi } from "@/lib/ai-extractor";
import { beginCrmBatch, flushCrmBatch, upsertContact, upsertOrganization } from "@/lib/crm";
import { fetchPage, searchSerpApi } from "@/lib/prospect";
import { createId, nowIso } from "@/lib/utils";
import { ensureSheetSchema, listContacts } from "@/lib/sheets";

const bodySchema = z.object({
  campaignName: z.string().min(1),
  geoTargets: z.array(z.string().min(1)).min(1),
  maxResultsPerQuery: z.number().int().min(5).max(100).optional(),
  prospectPublicLibraries: z.boolean().optional(),
  prospectSchoolLibraries: z.boolean().optional(),
});

const DEFAULT_MAX_RESULTS_PER_QUERY = 30;
const MAX_SERP_CANDIDATES_PER_QUERY = 15;

function sanitizeOrgName(name: string) {
  return name.replace(/\s+/g, " ").replace(/\|\s*.*$/, "").replace(/-\s*home$/i, "").trim();
}

function extractH1Title(html: string) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: string, data: any) => {
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(payload));
    } catch (e) {
      // ignore
    }
  };

  (async () => {
    try {
      beginCrmBatch();
      await sendEvent("progress", { message: "Initializing...", pct: 5 });

      await ensureSheetSchema();
      const existingContacts = await listContacts();
      const knownEmails = new Set(existingContacts.map((c) => c.email.toLowerCase()).filter(Boolean));

      const reqJson = await req.json();
      const parsed = bodySchema.safeParse(reqJson);
      if (!parsed.success) {
        await sendEvent("error", { error: "Invalid input" });
        return;
      }
      
      const input = parsed.data;
      const maxResultsPerQuery = input.maxResultsPerQuery ?? DEFAULT_MAX_RESULTS_PER_QUERY;
      
      let discoveredCount = 0;
      let queuedForReviewCount = 0;
      const failedQueries: string[] = [];
      const queryPlan: { geo: string; kw: string; type: "public" | "school" }[] = [];

      for (const geo of input.geoTargets) {
        if (input.prospectPublicLibraries) {
          queryPlan.push({ geo, kw: `"${geo}" "Public Library" staff directory OR librarian`, type: "public" });
        }
        if (input.prospectSchoolLibraries) {
          queryPlan.push({ geo, kw: `"${geo}" school district "library media specialist" OR "librarian" directory`, type: "school" });
        }
      }

      for (let i = 0; i < queryPlan.length; i++) {
        const step = queryPlan[i];
        await sendEvent("progress", { 
          message: `[${i + 1}/${queryPlan.length}] Querying ${step.geo} (${step.type})`,
          pct: Math.floor(10 + ((i / queryPlan.length) * 90))
        });

        let results: Awaited<ReturnType<typeof searchSerpApi>> = [];
        try {
          results = await searchSerpApi(step.kw, maxResultsPerQuery);
        } catch (error) {
          failedQueries.push(step.kw);
          continue;
        }

        const candidates = results.slice(0, MAX_SERP_CANDIDATES_PER_QUERY);
        await Promise.allSettled(candidates.map(async (item) => {
          if (!item.link) return;
          try {
            const html = await fetchPage(item.link);
            const h1 = extractH1Title(html);
            let orgName = sanitizeOrgName(h1 || item.title || "");
            
            const aiOrg = await inferOrganizationNameWithAi({ html, pageUrl: item.link, pageTitle: item.title ?? "" });
            if (aiOrg) orgName = sanitizeOrgName(aiOrg);

            const org = await upsertOrganization({
              name: orgName,
              website: item.link,
              sourceQuery: step.kw,
              sourceUrl: item.link,
              libraryType: step.type,
            });

            const extracted = await extractContactsWithAi({
              html,
              pageUrl: item.link,
              pageTitle: item.title ?? "",
            });

            for (const found of extracted) {
              const normalizedEmail = (found.email ?? "").toLowerCase();
              if (!normalizedEmail || knownEmails.has(normalizedEmail)) continue;

              const row = await upsertContact({
                orgId: org.id,
                orgName: org.name,
                fullName: found.fullName,
                title: found.title,
                email: found.email,
                phone: found.phone,
                sourceQuery: step.kw,
                sourceUrl: item.link,
              });

              if (row) {
                knownEmails.add(normalizedEmail);
                discoveredCount++;
                queuedForReviewCount++;
                
                await sendEvent("progress", { 
                  message: `Discovered ${row.email} at ${org.name}`,
                  pct: Math.floor(10 + ((i / queryPlan.length) * 90))
                });
              }
            }
          } catch (err) {
            // ignore fetch/parse errors on individual links
          }
        }));
      }

      await flushCrmBatch();
      await sendEvent("done", { discoveredCount, queuedForReviewCount, failedQueries });
    } catch (e) {
      const err = e as Error;
      await sendEvent("error", { error: err.message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
