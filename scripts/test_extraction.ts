import { fetchPage, findStaffLikeLinks, searchSerpApi } from "../src/lib/prospect";
import { extractContactsWithAi, inferOrganizationNameWithAi } from "../src/lib/ai-extractor";

async function runTest() {
  const geo = "Great Neck";
  console.log(`=== EXECUTING COMPLETE BACKEND EXTRACTION FOR: "${geo}" ===\n`);

  const queries = [
    { type: "public", kw: `${geo} public library staff directory librarian` },
    { type: "school", kw: `${geo} school district library media specialist librarian directory` },
  ];

  const allLeads: Array<{
    orgName: string;
    fullName: string;
    title: string;
    email: string;
    phone: string;
    sourceUrl: string;
  }> = [];

  for (const q of queries) {
    console.log(`\n--- QUERY [${q.type.toUpperCase()}]: "${q.kw}" ---`);
    let results: Awaited<ReturnType<typeof searchSerpApi>> = [];
    try {
      results = await searchSerpApi(q.kw, 10);
      console.log(`SerpApi returned ${results.length} results.`);
    } catch (err) {
      console.error(`SERP search failed:`, err);
      continue;
    }

    for (const item of results) {
      console.log(`\n[Checking Site]: ${item.title} -> ${item.link}`);
      try {
        const mainHtml = await fetchPage(item.link);
        const orgName = await inferOrganizationNameWithAi({
          html: mainHtml,
          pageUrl: item.link,
          pageTitle: item.title,
        });

        const subLinks = findStaffLikeLinks(mainHtml, item.link).slice(0, 3);
        const pagesToProcess = [
          { url: item.link, html: mainHtml, isSub: false },
          ...await Promise.all(
            subLinks.map(async (subUrl) => {
              try {
                const subHtml = await fetchPage(subUrl);
                return { url: subUrl, html: subHtml, isSub: true };
              } catch {
                return null;
              }
            })
          ),
        ].filter(Boolean) as Array<{ url: string; html: string; isSub: boolean }>;

        for (const targetPage of pagesToProcess) {
          const extracted = await extractContactsWithAi({
            html: targetPage.html,
            pageUrl: targetPage.url,
            pageTitle: item.title,
          });

          for (const c of extracted) {
            allLeads.push({
              orgName: orgName || item.title,
              fullName: c.fullName,
              title: c.title,
              email: c.email,
              phone: c.phone,
              sourceUrl: targetPage.url,
            });
            console.log(`  ⭐ FOUND LEAD: ${c.fullName} (${c.title}) - ${c.email} [${targetPage.url}]`);
          }
        }
      } catch (err) {
        console.log(`  ❌ Could not fetch: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`TOTAL CLEAN LEADS EXTRACTED FOR ${geo.toUpperCase()}: ${allLeads.length}`);
  console.log(`==================================================\n`);
  allLeads.forEach((l, i) => {
    console.log(`${i + 1}. ${l.fullName} | ${l.title} | ${l.email} | Org: ${l.orgName}`);
  });
}

runTest().catch(console.error);
