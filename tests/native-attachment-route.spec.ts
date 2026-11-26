import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ userId: "user-one", row: null as null | { storage_path: string }, filters: [] as unknown[], signed: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => mocks.userId }));
vi.mock("@/lib/env", () => ({ env: { supabaseStorageBucket: "reminder-files" } }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServiceClient: () => ({
  from: () => ({ select: () => ({ eq: (_: string, id: string) => ({ eq: (name: string, user: string) => {
    mocks.filters.push([name, user]); return { maybeSingle: async () => ({ data: mocks.row, error: null }) };
  } }) }) }),
  storage: { from: () => ({ createSignedUrl: mocks.signed }) }
}) }));
import { GET } from "@/app/api/native/attachments/[id]/route";
describe("native attachment access", () => {
  beforeEach(() => { mocks.row = null; mocks.filters = []; mocks.signed.mockReset(); });
  const context = { params: Promise.resolve({ id: "123e4567-e89b-42d3-a456-426614174000" }) };
  it("only signs an attachment filtered by the authenticated owner", async () => {
    mocks.row = { storage_path: "user-one/file" };
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error: null });
    const response = await GET(new Request("https://example.test"), context);
    expect(response.status).toBe(200);
    expect(mocks.filters).toContainEqual(["reminders.user_id", "user-one"]);
    expect(mocks.signed).toHaveBeenCalledWith("user-one/file", 60);
  });
  it("does not sign an inaccessible attachment", async () => {
    const response = await GET(new Request("https://example.test"), context);
    expect(response.status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });
});
