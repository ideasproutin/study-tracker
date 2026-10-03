import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const fake = vi.hoisted(() => ({
  listener: null as ((event: string, session: unknown) => void) | null,
  session: null as unknown,
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../utils/supabase", () => {
  const auth = {
    getSession: fake.getSession,
    onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
      fake.listener = cb;
      return { data: { subscription: { unsubscribe: fake.unsubscribe } } };
    },
    signInWithPassword: fake.signInWithPassword,
    signUp: fake.signUp,
    resetPasswordForEmail: fake.resetPasswordForEmail,
    updateUser: fake.updateUser,
    signOut: fake.signOut,
  };
  return {
    supabase: { auth },
    configurationError: "",
    requireSupabase: () => ({ auth }),
  };
});
vi.mock("../App", () => ({
  App: ({ userId }: { userId: string }) => <div>Account {userId}</div>,
}));
import { AuthenticatedApp } from "./AuthenticatedApp";
import { AuthProvider, useAuth } from "./AuthProvider";
const session = (id = "user-a") => ({
  access_token: "test-access",
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user: { id, email: "user@example.test" },
});
beforeEach(() => {
  fake.listener = null;
  fake.session = null;
  fake.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: null }, error: null });
  fake.signInWithPassword.mockReset().mockImplementation(async () => {
    fake.listener?.("SIGNED_IN", session());
    return { data: { session: session() }, error: null };
  });
  fake.signUp
    .mockReset()
    .mockResolvedValue({
      data: { session: null, user: { id: "new-user" } },
      error: null,
    });
  fake.resetPasswordForEmail
    .mockReset()
    .mockResolvedValue({ data: {}, error: null });
  fake.updateUser
    .mockReset()
    .mockResolvedValue({ data: { user: session().user }, error: null });
  fake.signOut.mockReset().mockImplementation(async () => {
    fake.listener?.("SIGNED_OUT", null);
    return { error: null };
  });
  window.history.replaceState(null, "", "/");
});
async function loginScreen() {
  render(<AuthenticatedApp />);
  await screen.findByRole("button", { name: "Sign In" });
  return userEvent.setup();
}
describe("Supabase authentication flows", () => {
  it("gates application access and shows auth loading until session restoration completes", async () => {
    let finish!: (value: unknown) => void;
    fake.getSession.mockReturnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    render(<AuthenticatedApp />);
    expect(screen.getByRole("status").textContent).toContain("Restoring");
    expect(screen.queryByText("Account user-a")).toBe(null);
    await act(async () => finish({ data: { session: null }, error: null }));
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
  });
  it("signs in and opens only the authenticated user’s application", async () => {
    const user = await loginScreen();
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.test",
      password: "secure-password",
    });
    expect(await screen.findByText("Account user-a")).toBeTruthy();
  });
  it("restores persistent sessions after startup", async () => {
    fake.getSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });
    render(<AuthenticatedApp />);
    expect(await screen.findByText("Account user-a")).toBeTruthy();
  });
  it("clears application state when an expired session emits SIGNED_OUT", async () => {
    fake.getSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });
    render(<AuthenticatedApp />);
    await screen.findByText("Account user-a");
    act(() => fake.listener?.("SIGNED_OUT", null));
    expect(await screen.findByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.queryByText("Account user-a")).toBe(null);
  });
  it("handles incorrect passwords without granting app access", async () => {
    fake.signInWithPassword.mockResolvedValue({
      error: new Error("Invalid login credentials"),
    });
    const user = await loginScreen();
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(screen.getByRole("alert").textContent).toContain("Invalid login");
    expect(screen.queryByText("Account user-a")).toBe(null);
  });
  it("signs up with name metadata and waits for email confirmation", async () => {
    const user = await loginScreen();
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("NAME"), "User A");
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.type(
      screen.getByLabelText("CONFIRM PASSWORD"),
      "secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(fake.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ data: { display_name: "User A" } }),
      }),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Check your email",
    );
    expect(screen.queryByText("Account user-a")).toBe(null);
  });
  it("rejects mismatching signup passwords before an auth request", async () => {
    const user = await loginScreen();
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("NAME"), "User");
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.type(
      screen.getByLabelText("CONFIRM PASSWORD"),
      "different-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toContain("do not match");
    expect(fake.signUp).not.toHaveBeenCalled();
  });
  it("handles duplicate-email errors from Supabase", async () => {
    fake.signUp.mockResolvedValue({
      error: new Error("User already registered"),
    });
    const user = await loginScreen();
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("NAME"), "User");
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.type(
      screen.getByLabelText("CONFIRM PASSWORD"),
      "secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "already registered",
    );
  });
  it("requests password-reset links with an app recovery redirect", async () => {
    const user = await loginScreen();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(fake.resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.test",
      { redirectTo: expect.stringContaining("?flow=recovery") },
    );
    expect(screen.getByRole("status").textContent).toContain(
      "If an account exists",
    );
  });
  it("updates password during recovery before allowing dashboard access", async () => {
    window.history.replaceState(null, "", "/?flow=recovery");
    fake.getSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });
    render(<AuthenticatedApp />);
    await screen.findByRole("button", { name: "Update password" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("PASSWORD"), "new-secure-password");
    await user.type(
      screen.getByLabelText("CONFIRM PASSWORD"),
      "new-secure-password",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(fake.updateUser).toHaveBeenCalledWith({
      password: "new-secure-password",
    });
    expect(await screen.findByText("Account user-a")).toBeTruthy();
    expect(window.location.search).toBe("");
  });
  it("handles unavailable network and keeps submitted inputs", async () => {
    fake.signInWithPassword.mockRejectedValue(new Error("Network unavailable"));
    const user = await loginScreen();
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Network unavailable",
    );
    expect((screen.getByLabelText("EMAIL") as HTMLInputElement).value).toBe(
      "user@example.test",
    );
  });
  it("prevents duplicate login requests on slow networks", async () => {
    let resolve!: (value: unknown) => void;
    fake.signInWithPassword.mockReturnValue(
      new Promise((done) => (resolve = done)),
    );
    const user = await loginScreen();
    await user.type(screen.getByLabelText("EMAIL"), "user@example.test");
    await user.type(screen.getByLabelText("PASSWORD"), "secure-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    expect(
      screen.getByRole("button", { name: "Please wait…" }).matches(":disabled"),
    ).toBe(true);
    expect(fake.signInWithPassword).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ error: new Error("Try again") }));
  });
  it("signs out locally through the Supabase client", async () => {
    function Logout() {
      const auth = useAuth();
      return (
        <button onClick={() => void auth.signOut()}>
          Logout {auth.user?.id}
        </button>
      );
    }
    fake.getSession.mockResolvedValue({
      data: { session: session() },
      error: null,
    });
    render(
      <AuthProvider>
        <Logout />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Logout user-a" }),
    );
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
  });
});
