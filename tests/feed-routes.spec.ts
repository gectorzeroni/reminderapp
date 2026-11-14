import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => "feed-route-owner" }));
import { POST as createFeed } from "@/app/api/feeds/route";
import { POST as createNote } from "@/app/api/notes/route";
import { PATCH as updateNote } from "@/app/api/notes/[id]/route";
import { DELETE as deleteFeed, PATCH as renameFeed } from "@/app/api/feeds/[id]/route";
import { getNotes } from "@/lib/repositories/reminders";
import { createCustomFeed } from "@/lib/repositories/feeds";

function jsonRequest(url: string, method: string, data: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
}

describe("custom feed routes", () => {
  beforeEach(() => { global.__laterFeeds?.clear(); });
  it("creates a tab and saves and moves a note into it", async () => {
    const feedResponse = await createFeed(jsonRequest("http://localhost/api/feeds", "POST", { name: "Work" }));
    expect(feedResponse.status).toBe(201);
    const { feed } = await feedResponse.json();
    const noteResponse = await createNote(jsonRequest("http://localhost/api/notes", "POST", { text: "Test" }));
    const { note } = await noteResponse.json();
    const moved = await updateNote(jsonRequest("http://localhost/api/notes/1", "PATCH", { feed: feed.id }), { params: Promise.resolve({ id: note.id }) });
    expect((await moved.json()).note.feed).toBe(feed.id);
    const created = await createNote(jsonRequest("http://localhost/api/notes", "POST", { text: "In work", feed: feed.id }));
    expect((await created.json()).note.feed).toBe(feed.id);
  });
  it("renames a tab and returns its notes to All when deleted", async () => {
    const feed = await createCustomFeed("feed-route-owner", "Drafts");
    const noteResponse = await createNote(jsonRequest("http://localhost/api/notes", "POST", { text: "Keep me", feed: feed.id }));
    const { note } = await noteResponse.json();
    const context = { params: Promise.resolve({ id: feed.id }) };
    const renamed = await renameFeed(jsonRequest("http://localhost/api/feeds/1", "PATCH", { name: "Projects" }), context);
    expect((await renamed.json()).feed.name).toBe("Projects");
    const removed = await deleteFeed(new Request("http://localhost/api/feeds/1", { method: "DELETE" }), context);
    expect(removed.status).toBe(200);
    expect((await getNotes("feed-route-owner")).find((item) => item.id === note.id)).toMatchObject({ feed: "all", note: "Keep me" });
  });
  it("does not let another account rename or delete a tab", async () => {
    const feed = await createCustomFeed("different-owner", "Private");
    const context = { params: Promise.resolve({ id: feed.id }) };
    expect((await renameFeed(jsonRequest("http://localhost/api/feeds/1", "PATCH", { name: "Changed" }), context)).status).toBe(404);
    expect((await deleteFeed(new Request("http://localhost/api/feeds/1", { method: "DELETE" }), context)).status).toBe(404);
  });
  it("rejects another user's tab for creation or moving", async () => {
    const feed = await createCustomFeed("different-owner", "Private");
    const response = await createNote(jsonRequest("http://localhost/api/notes", "POST", { text: "Test", feed: feed.id }));
    expect(response.status).toBe(400);
    const moved = await updateNote(jsonRequest("http://localhost/api/notes/1", "PATCH", { feed: feed.id }), { params: Promise.resolve({ id: "missing" }) });
    expect(moved.status).toBe(400);
  });
});
