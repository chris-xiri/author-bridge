import { fetchPage, findStaffLikeLinks, searchSerpApi } from "../src/lib/prospect";
import { extractContactsWithAi, inferOrganizationNameWithAi } from "../src/lib/ai-extractor";

async function runTest() {
  const geo = "Great Neck";
  console.log(`=== RUNNING BACKEND EXTRACTION TEST FOR: "${geo}" ===\n`);

  const queries = [
    { type: "public", kw: `${geo} public library staff directory librarian` },
    { type: "school", kw: `${geo} school district library media specialist librarian directory` },
  ];

  for (const q of queries) {
    console.log(`\n--- QUERY [${q.type.toUpperCase()}]: "${q.kw}" ---`);
    let results: Awaited<ReturnType<typeof searchSerpApi>> = [];
    try {
      results = await searchSerpApi(q.kw, 10);
      console.log(`Found ${results.length} SERP results.`);
    } catch (err) {
      console.error(`SERP search failed:`, err);
      continue;
    }

    const topCandidates = results.slice(0, 5);
    for (const item of topCandidates) {
      console.log(`\n[Candidate Site]: ${item.title} -> ${item.link}`);
      try {
        const mainHtml = await fetchPage(item.link);
        console.log(`  Fetched main page (${mainHtml.length} bytes)`);

        const orgName = await inferOrganizationNameWithAi({
          html: mainHtml,
          pageUrl: item.link,
          pageTitle: item.title,
        });
        console.log(`  Inferred Org Name: "${orgName}"`);

        const subLinks = findStaffLikeLinks(mainHtml, item.link).slice(0, 3);
        console.log(`  Discovered ${subLinks.length} sub-links:`, subLinks);

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
          console.log(`  Extracting AI contacts from ${targetPage.isSub ? "SUB-PAGE" : "MAIN-PAGE"}: ${targetPage.url}`);
          const extracted = await extractContactsWithAi({
            html: targetPage.html,
            pageUrl: targetPage.url,
            pageTitle: item.title,
          });

          if (extracted.length > 0) {
            console.log(`  ✅ EXTRACTED ${extracted.length} CLEAN LEADS:`);
            extracted.forEach((c, idx) => {
              console.log(`     ${idx + 1}. Name: "${c.fullName}" | Title: "${c.title}" | Email: "${c.email}" | Phone: "${c.phone}"`);
            });
          } else {
            console.log(`     (0 contacts extracted from this page)`);
          }
        }
      } catch (err) {
        console.log(`  ❌ Failed to fetch/process site: ${(err as Error).message}`);
      }
    }
  }

  console.log("\n=== TEST COMPLETED ===");
}

runTest().catch(console.error);
