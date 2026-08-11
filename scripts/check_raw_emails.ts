import { fetchPage, searchSerpApi } from "../src/lib/prospect";

async function run() {
  const geo = "Great Neck";
  console.log(`=== CHECKING RAW EMAILS ON ALL PAGES FOR: "${geo}" ===\n`);

  const queries = [
    `${geo} public library staff directory librarian`,
    `${geo} school district library media specialist librarian directory`,
  ];

  const foundEmails: Array<{ url: string; email: string; snippet: string }> = [];

  for (const kw of queries) {
    const results = await searchSerpApi(kw, 10);
    for (const item of results) {
      try {
        const html = await fetchPage(item.link);
        const preprocessed = html
          .replace(/&#64;|&commat;/gi, "@")
          .replace(/&#46;/gi, ".")
          .replace(/<a[^>]+href=["']mailto:([^"'?]+)["'][^>]*>([\s\S]*?)<\/a>/gi, " $2 (Email: $1) ")
          .replace(/href=["']mailto:([^"'?]+)["']/gi, " (Email: $1) ")
          .replace(/data-email=["']([^"']+)["']/gi, " (Email: $1) ");

        const emails = preprocessed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const unique = Array.from(new Set(emails));

        if (unique.length > 0) {
          unique.forEach((e) => {
            // Find surrounding snippet
            const idx = preprocessed.indexOf(e);
            const start = Math.max(0, idx - 60);
            const end = Math.min(preprocessed.length, idx + e.length + 60);
            const snippet = preprocessed
              .slice(start, end)
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            foundEmails.push({ url: item.link, email: e, snippet });
          });
        }
      } catch (err) {
        // Ignored
      }
    }
  }

  console.log(`\nFound ${foundEmails.length} raw email occurrences across all pages:`);
  foundEmails.forEach((item, idx) => {
    console.log(`${idx + 1}. EMAIL: ${item.email} | URL: ${item.url}`);
    console.log(`   Snippet: "${item.snippet}"`);
  });
}

run().catch(console.error);
