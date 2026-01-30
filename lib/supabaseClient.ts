import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error(`Falta variable de entorno: ${name}`);
  }

  return value;
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  return client;
}
