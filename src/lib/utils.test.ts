import { describe, expect, it } from "vitest";
import { emailDomain, normalizeEmail } from "./utils";

describe("normalize utils", () => {
  it("normalizes email and extracts domain", () => {
    expect(normalizeEmail("  Test@Library.org ")).toBe("test@library.org");
    expect(emailDomain("test@library.org")).toBe("library.org");
  });
});

