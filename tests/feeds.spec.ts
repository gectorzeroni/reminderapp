import { describe, expect, it } from "vitest";
import { canUseFeed, createCustomFeed, getCustomFeeds } from "@/lib/repositories/feeds";
import { createNoteSchema, updateNoteSchema, createFeedSchema } from "@/lib/validation";

describe("custom note tabs", () => {
  it("stores tabs per user and validates ownership", async () => {
    const feed = await createCustomFeed("feed-test-owner", "Projects");
    expect(await getCustomFeeds("feed-test-owner")).toContainEqual(feed);
    expect(await canUseFeed("feed-test-owner", feed.id)).toBe(true);
    expect(await canUseFeed("feed-test-other", feed.id)).toBe(false);
    await expect(createCustomFeed("feed-test-owner", "projects")).rejects.toThrow();
    expect(createNoteSchema.parse({ text: "Note", feed: feed.id }).feed).toBe(feed.id);
    expect(updateNoteSchema.parse({ feed: feed.id }).feed).toBe(feed.id);
  });
  it("validates tab names", () => {
    expect(createFeedSchema.parse({ name: "  Work  " }).name).toBe("Work");
    expect(createFeedSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createFeedSchema.safeParse({ name: "x".repeat(31) }).success).toBe(false);
  });
});
