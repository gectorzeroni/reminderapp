import { randomUUID } from "node:crypto";
import { DEMO_USER_ID } from "@/lib/constants";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { NoteFeed } from "@/lib/types";

export type CustomFeed = { id: string; name: string };
type LocalFeed = CustomFeed & { userId: string };
declare global { var __laterFeeds: Map<string, LocalFeed> | undefined; }

function localStore() {
  return global.__laterFeeds ??= new Map();
}
function isDatabaseUser(userId: string) {
  return userId !== DEMO_USER_ID && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) && Boolean(getSupabaseServiceClient());
}
export async function getCustomFeeds(userId: string): Promise<CustomFeed[]> {
  if (!isDatabaseUser(userId)) return [...localStore().values()].filter((feed) => feed.userId === userId).map(({ id, name }) => ({ id, name }));
  const { data, error } = await getSupabaseServiceClient()!.from("note_feeds").select("id,name").eq("user_id", userId).order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function createCustomFeed(userId: string, name: string): Promise<CustomFeed> {
  if ((await getCustomFeeds(userId)).some((feed) => feed.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("A tab with that name already exists");
  if (!isDatabaseUser(userId)) {
    const feed = { id: randomUUID(), name, userId };
    localStore().set(feed.id, feed);
    return { id: feed.id, name: feed.name };
  }
  const { data, error } = await getSupabaseServiceClient()!.from("note_feeds").insert({ user_id: userId, name }).select("id,name").single();
  if (error) throw new Error(error.code === "23505" ? "A tab with that name already exists" : error.message);
  return data;
}
export async function canUseFeed(userId: string, feed: NoteFeed): Promise<boolean> {
  if (feed === "all" || feed === "ideas") return true;
  return (await getCustomFeeds(userId)).some((item) => item.id === feed);
}

export async function renameCustomFeed(userId: string, id: string, name: string): Promise<CustomFeed | null> {
  const feeds = await getCustomFeeds(userId);
  if (!feeds.some((feed) => feed.id === id)) return null;
  if (feeds.some((feed) => feed.id !== id && feed.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("A tab with that name already exists");
  if (!isDatabaseUser(userId)) {
    const existing = localStore().get(id)!;
    existing.name = name;
    return { id, name };
  }
  const { data, error } = await getSupabaseServiceClient()!.from("note_feeds").update({ name }).eq("user_id", userId).eq("id", id).select("id,name").maybeSingle();
  if (error) throw new Error(error.code === "23505" ? "A tab with that name already exists" : error.message);
  return data;
}

export async function deleteCustomFeed(userId: string, id: string): Promise<boolean> {
  if (!isDatabaseUser(userId)) {
    const existing = localStore().get(id);
    if (!existing || existing.userId !== userId) return false;
    const { getNotes, updateReminder } = await import("@/lib/repositories/reminders");
    const notes = await getNotes(userId);
    for (const note of notes) if (note.feed === id) await updateReminder(userId, note.id, { feed: "all" });
    return localStore().delete(id);
  }
  const { data, error } = await getSupabaseServiceClient()!.rpc("delete_note_feed", { p_user_id: userId, p_feed_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}
