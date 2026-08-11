import { fetchPage } from "../src/lib/prospect";
import { extractContactsWithAi } from "../src/lib/ai-extractor";

async function main() {
  const url = "https://sms.greatneck.k12.ny.us/departments/library-instructional-technology/staff";
  console.log(`Fetching ${url}...`);
  const html = await fetchPage(url);
  console.log(`Fetched ${html.length} chars.`);

  console.log("Running AI Extraction...");
  const contacts = await extractContactsWithAi({
    html,
    pageUrl: url,
    pageTitle: "Staff - Great Neck South Middle School",
  });

  console.log(`Extracted ${contacts.length} contacts:`, JSON.stringify(contacts, null, 2));
}

main().catch(console.error);
