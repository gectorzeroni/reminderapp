import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLinkPreview, parseLinkMetadata } from "@/lib/metadata";
import { createReminder, updateReminder } from "@/lib/repositories/reminders";

afterEach(() => vi.unstubAllGlobals());

describe("link previews", () => {
  it("reads social titles, decodes entities, and resolves relative favicons", () => {
    expect(parseLinkMetadata(`<title>Fallback</title><meta content='Design &amp; Code &#8212; Today' property='og:title'><link href='/icon.png' rel='icon'>`, "https://example.com/article")).toEqual({
      previewTitle: "Design & Code — Today",
      previewIconUrl: "https://example.com/icon.png"
    });
  });

  it("uses the document title and a domain favicon when metadata is absent", () => {
    expect(parseLinkMetadata("<title> A\n great &quot;page&quot; </title>", "https://example.com")).toEqual({
      previewTitle: 'A great "page"',
      previewIconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64"
    });
  });

  it("replaces URL placeholders with fetched titles when creating and editing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Readable page title</title><link rel='icon' href='/favicon.png'>")));
    const attachment = { kind: "link" as const, url: "https://example.com/page", previewTitle: "https://example.com/page", metadataStatus: "pending" as const };
    const reminder = await createReminder("link-preview-test", { attachments: [attachment] });
    expect(reminder.attachments[0].previewTitle).toBe("Readable page title");
    expect(reminder.attachments[0].previewIconUrl).toBe("https://example.com/favicon.png");
    const edited = await updateReminder("link-preview-test", reminder.id, { attachments: [attachment] });
    expect(edited?.attachments[1].previewTitle).toBe("Readable page title");
  });

  it("keeps a favicon fallback when the page cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unavailable")));
    expect(await fetchLinkPreview("https://example.com")).toMatchObject({ previewTitle: null, metadataStatus: "failed", previewIconUrl: expect.any(String) });
  });
});
