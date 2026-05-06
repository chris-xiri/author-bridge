import { describe, expect, it } from "vitest";
import { mergeTemplate } from "./email-template";

describe("mergeTemplate", () => {
  it("replaces known variables", () => {
    const out = mergeTemplate("Hi {{fullName}}", { fullName: "Alex" });
    expect(out).toBe("Hi Alex");
  });
});

