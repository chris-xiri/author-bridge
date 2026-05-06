import { describe, expect, it } from "vitest";
import { extractContactsFromHtml } from "./contact-extractor";

describe("extractContactsFromHtml", () => {
  it("extracts librarian contacts from html text", () => {
    const html = `
      <html><body>
      Contact Jane Doe, School Librarian, jane.doe@district.edu, (212) 555-1234
      </body></html>
    `;
    const contacts = extractContactsFromHtml(html);
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0].email).toBe("jane.doe@district.edu");
  });
});

