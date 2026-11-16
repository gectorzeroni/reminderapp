import { DEMO_USER_ID } from "@/lib/constants";
import { getNotes } from "@/lib/repositories/reminders";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

declare global { var __laterTopThree: Map<string, string[]> | undefined; }
const localStore = () => global.__laterTopThree ??= new Map<string, string[]>();
function databaseUser(userId: string) {
  return userId !== DEMO_USER_ID && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) && Boolean(getSupabaseServiceClient());
}
export async function getTopThree(userId: string): Promise<string[]> {
  if (!databaseUser(userId)) {
    const available = new Set((await getNotes(userId)).map((note) => note.id));
    const ids = (localStore().get(userId) ?? []).filter((id) => available.has(id));
    localStore().set(userId, ids);
    return ids;
  }
  const { data, error } = await getSupabaseServiceClient()!.from("top_three_notes").select("note_id").eq("user_id", userId).order("slot");
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => item.note_id);
}
export async function addTopThree(userId: string, noteId: string): Promise<"added" | "already_added" | "full" | "not_found"> {
  if (!databaseUser(userId)) {
    const available = new Set((await getNotes(userId)).map((note) => note.id));
    if (!available.has(noteId)) return "not_found";
    const ids = (localStore().get(userId) ?? []).filter((id) => available.has(id));
    if (ids.includes(noteId)) return "already_added";
    if (ids.length >= 3) return "full";
    localStore().set(userId, [...ids, noteId]);
    return "added";
  }
  const { data, error } = await getSupabaseServiceClient()!.rpc("add_top_three_note", { p_user_id: userId, p_note_id: noteId });
  if (error) throw new Error(error.message);
  if (!["added", "already_added", "full", "not_found"].includes(data)) throw new Error("Could not add note to Top 3");
  return data;
}
export async function removeTopThree(userId: string, noteId: string): Promise<void> {
  if (!databaseUser(userId)) { localStore().set(userId, (localStore().get(userId) ?? []).filter((id) => id !== noteId)); return; }
  const { error } = await getSupabaseServiceClient()!.rpc("remove_top_three_note", { p_user_id: userId, p_note_id: noteId });
  if (error) throw new Error(error.message);
}

export async function reorderTopThree(userId: string, noteIds: string[]): Promise<boolean> {
  if (!noteIds.length || noteIds.length > 3 || new Set(noteIds).size !== noteIds.length) return false;
  if (!databaseUser(userId)) {
    const current = await getTopThree(userId);
    if (current.length !== noteIds.length || noteIds.some((id) => !current.includes(id))) return false;
    localStore().set(userId, [...noteIds]);
    return true;
  }
  if (noteIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return false;
  const { data, error } = await getSupabaseServiceClient()!.rpc("reorder_top_three", { p_user_id: userId, p_note_ids: noteIds });
  if (error) throw new Error(error.message);
  return data === true;
}
