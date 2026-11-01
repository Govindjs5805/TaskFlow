import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Normalize Supabase URL safely in code without touching .env:
// e.g. "https://xyz.supabase.co/rest/v1/" -> "https://xyz.supabase.co"
export const normalizedSupabaseUrl = rawUrl
  ? rawUrl.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
  : undefined;

export const isSupabaseConfigured = Boolean(normalizedSupabaseUrl && key);
export const supabase = isSupabaseConfigured
  ? createClient(normalizedSupabaseUrl!, key!.trim())
  : null;

