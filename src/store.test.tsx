import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { emptyData } from "./model";
import { useStudyData } from "./store";
const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  notify: null as (() => void) | null,
}));
vi.mock("./utils/repository", async () => ({
  ...(await vi.importActual("./utils/repository")),
  loadSnapshot: api.load,
  saveSnapshot: api.save,
}));
vi.mock("./utils/supabase", () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_type: unknown, _opts: unknown, cb: () => void) => {
          api.notify = cb;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
const snapshot = (id = "a", revision = 0) => ({
  revision,
  profile: { id, displayName: id, avatarUrl: null },
  data: {
    ...emptyData(),
    preferences: { dailyTarget: 60, onboardingDone: true },
  },
});
beforeEach(() => {
  api.load.mockReset().mockImplementation(async (id: string) => snapshot(id));
  api.save
    .mockReset()
    .mockImplementation(
      async (id: string, previous: { revision: number }, data: unknown) => ({
        ...snapshot(id, previous.revision + 1),
        data,
      }),
    );
  api.notify = null;
});
describe("authenticated cloud store", () => {
  it("loads each account from Supabase and clears old state on an identity change", async () => {
    const { result, rerender } = renderHook(({ id }) => useStudyData(id), {
      initialProps: { id: "a" },
    });
    await waitFor(() => expect(result.current.profile?.id).toBe("a"));
    rerender({ id: "b" });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.profile?.id).toBe("b"));
    expect(api.load).toHaveBeenCalledWith("b", expect.any(AbortSignal));
  });
  it("writes only through the repository and returns confirmed database state", async () => {
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let saved = false;
    await act(async () => {
      saved = await result.current.update((d) => ({
        ...d,
        preferences: { ...d.preferences, dailyTarget: 90 },
      }));
    });
    expect(saved).toBe(true);
    expect(result.current.data.preferences.dailyTarget).toBe(90);
    expect(api.save).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ revision: 0 }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });
  it("keeps confirmed state and reports failed requests", async () => {
    api.save.mockRejectedValue(new Error("Network unavailable"));
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(
        await result.current.update((d) => ({
          ...d,
          preferences: { ...d.preferences, dailyTarget: 90 },
        })),
      ).toBe(false);
    });
    expect(result.current.data.preferences.dailyTarget).toBe(60);
    expect(result.current.error).toContain("Network unavailable");
  });
  it("confirms committed data after a lost response and does not ask users to duplicate the save", async () => {
    api.save.mockRejectedValue(new Error("Lost response"));
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.load.mockResolvedValue({
      ...snapshot("a", 1),
      data: {
        ...emptyData(),
        preferences: { dailyTarget: 90, onboardingDone: true },
      },
    });
    await act(async () => {
      expect(
        await result.current.update((d) => ({
          ...d,
          preferences: { ...d.preferences, dailyTarget: 90 },
        })),
      ).toBe(true);
    });
    expect(result.current.data.preferences.dailyTarget).toBe(90);
    expect(result.current.error).toBe("");
  });
  it("handles an empty/unavailable schema with a retryable error rather than local fallback", async () => {
    api.load.mockRejectedValue({ code: "PGRST202" });
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.readBlocked).toBe(true);
    expect(result.current.error).toContain("not installed");
  });
  it("reloads on Realtime notifications and focus for device sync", async () => {
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.load.mockResolvedValue({
      ...snapshot("a", 5),
      data: {
        ...emptyData(),
        preferences: { dailyTarget: 120, onboardingDone: true },
      },
    });
    await act(async () => api.notify?.());
    await waitFor(() =>
      expect(result.current.data.preferences.dailyTarget).toBe(120),
    );
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() =>
      expect(api.load.mock.calls.length).toBeGreaterThanOrEqual(3),
    );
  });
  it("rejects a second save while the first request is in flight", async () => {
    let finish!: (value: unknown) => void;
    api.save.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useStudyData("a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.update((d) => d);
    });
    expect(result.current.saving).toBe(true);
    await act(async () => {
      expect(await result.current.update((d) => d)).toBe(false);
    });
    await act(async () => {
      finish(snapshot("a", 1));
      await pending;
    });
    expect(api.save).toHaveBeenCalledTimes(1);
  });
  it("aborts and ignores in-flight requests when the authenticated app unmounts", async () => {
    let finish!: (value: unknown) => void;
    api.load.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = renderHook(() => useStudyData("a"));
    const signal = api.load.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(snapshot("a")));
  });
});
