import { describe, expect, it } from "vitest";
import { extractUrlsFromText, isLikelyUrl } from "@/lib/parse";

describe("parse helpers", () => {
  it("detects likely urls", () => {
    expect(isLikelyUrl("https://example.com")).toBe(true);
    expect(isLikelyUrl("not a url")).toBe(false);
  });

  it("extracts urls from text", () => {
    const urls = extractUrlsFromText("Read https://a.com and https://b.com today");
    expect(urls).toEqual(["https://a.com", "https://b.com"]);
  });
});
