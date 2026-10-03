import { useState, FormEvent } from "react";
import { SignOut } from "@phosphor-icons/react";
import { useAuth } from "./AuthProvider";
import { requireSupabase } from "../utils/supabase";
import type { Profile } from "../utils/repository";
export function AccountPanel({
  profile,
  onRefresh,
  onSignOut,
}: {
  profile: Profile | null;
  onRefresh: () => Promise<void>;
  onSignOut: () => void;
}) {
  const auth = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    try {
      const { error } = await requireSupabase()
        .from("profiles")
        .update({ display_name: name })
        .eq("id", auth.user!.id);
      if (error) throw error;
      await onRefresh();
      setSuccess("Profile updated.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update your profile.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-panel">
      <h2>Your account</h2>
      <p>{auth.user?.email}</p>
      <form onSubmit={save}>
        <label className="field-label" htmlFor="profile-name">
          DISPLAY NAME
        </label>
        <input
          key={profile?.displayName}
          id="profile-name"
          name="name"
          maxLength={100}
          required
          defaultValue={profile?.displayName || ""}
        />
        <button className="secondary full" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      {(error || auth.error) && (
        <p className="form-error" role="alert">
          {error || auth.error}
        </p>
      )}
      {success && (
        <p role="status" className="success-text">
          {success}
        </p>
      )}
      <button className="secondary full" onClick={onSignOut} disabled={busy}>
        <SignOut size={18} />
        Sign out
      </button>
      <div className="settings-divider" />
    </div>
  );
}
