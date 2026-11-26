import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorization: null as string | null, getUser: vi.fn(), cookieAuth: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(mocks.authorization ? { authorization: mocks.authorization } : {}),
  cookies: async () => ({ get: () => undefined })
}));
vi.mock("@/lib/env", () => ({ env: { supabaseUrl: "https://example.supabase.co", supabaseAnonKey: "public" }, hasSupabasePublicEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerAuthClient: mocks.cookieAuth }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
import { getCurrentUserId } from "@/lib/auth";

describe("native bearer authentication", () => {
  beforeEach(() => { mocks.authorization = null; mocks.getUser.mockReset(); mocks.cookieAuth.mockReset(); });
  it("uses the identity verified by Supabase", async () => {
    mocks.authorization = "Bearer access-token";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    expect(await getCurrentUserId()).toBe("user-123");
    expect(mocks.getUser).toHaveBeenCalledWith("access-token");
    expect(mocks.cookieAuth).not.toHaveBeenCalled();
  });
  it("rejects an invalid bearer without falling back to a browser session", async () => {
    mocks.authorization = "Bearer bad";
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    await expect(getCurrentUserId()).rejects.toThrow("Unauthorized");
    expect(mocks.cookieAuth).not.toHaveBeenCalled();
  });
  it("rejects malformed authorization headers", async () => {
    mocks.authorization = "Basic abc";
    await expect(getCurrentUserId()).rejects.toThrow("Unauthorized");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
