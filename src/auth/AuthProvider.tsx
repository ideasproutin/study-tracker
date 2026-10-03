import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  supabase,
  configurationError,
  requireSupabase,
} from "../utils/supabase";
type AuthState = {
  user: User | null;
  loading: boolean;
  error: string;
  recovery: boolean;
  signOut: () => Promise<boolean>;
  finishRecovery: () => void;
  retry: () => void;
};
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState(
    () =>
      new URLSearchParams(window.location.search).get("flow") === "recovery" ||
      window.location.hash.includes("type=recovery"),
  );
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError(configurationError);
      return;
    }
    let alive = true,
      eventReceived = false;
    setLoading(true);
    setError("");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      eventReceived = true;
      setSession(next);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setRecovery(false);
        window.history.replaceState(null, "", window.location.pathname);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
        if (!eventReceived) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(
            "Could not restore your login. Check your connection and retry.",
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [attempt]);
  const signOut = async () => {
    setError("");
    try {
      const { error } = await requireSupabase().auth.signOut({
        scope: "local",
      });
      if (error) {
        setError(error.message);
        return false;
      }
      setSession(null);
      setRecovery(false);
      window.history.replaceState(null, "", window.location.pathname);
      return true;
    } catch {
      setError("Could not sign out. Check your connection and retry.");
      return false;
    }
  };
  const finishRecovery = () => {
    setRecovery(false);
    window.history.replaceState(null, "", `${window.location.pathname}#Today`);
  };
  return (
    <Context.Provider
      value={{
        user: session?.user || null,
        loading,
        error,
        recovery,
        signOut,
        finishRecovery,
        retry: () => setAttempt((n) => n + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const state = useContext(Context);
  if (!state) throw new Error("AuthProvider is required");
  return state;
}
