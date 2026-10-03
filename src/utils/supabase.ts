import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
function isPublicKey(value: string) {
  if (value.startsWith("sb_publishable_")) return true;
  // Support legacy anon keys, but reject any privileged JWT.
  try {
    return (
      JSON.parse(
        atob(value.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
export const configurationError =
  !url || !key
    ? "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart the app."
    : !isPublicKey(key)
      ? "A frontend publishable key is required. Secret and service-role keys are not allowed."
      : "";
export const supabase = configurationError
  ? null
  : createClient<Database>(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
export function requireSupabase() {
  if (!supabase) throw new Error(configurationError);
  return supabase;
}
