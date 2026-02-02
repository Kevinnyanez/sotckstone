/**
 * Mercado Libre – Autenticación OAuth 2.0.
 * Intercambio de code por tokens, refresh y guardado en Supabase.
 */

import { getSupabaseServerClient } from "../supabaseServer";

export const PLATFORM = "mercadolibre" as const;

const ML_OAUTH_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const ML_USERS_ME_URL = "https://api.mercadolibre.com/users/me";

function getEnv(name: string): string | undefined {
  return process.env[name];
}

function requireEnv(name: string): string {
  const v = getEnv(name);
  if (!v?.trim()) throw new Error(`Falta variable de entorno: ${name}`);
  return v.trim();
}

/**
 * URL de autorización para que el usuario conecte su cuenta ML.
 */
export function getAuthUrl(options?: { state?: string }): string {
  const clientId = requireEnv("MERCADOLIBRE_CLIENT_ID");
  const redirectUri = requireEnv("MERCADOLIBRE_REDIRECT_URI");
  const state = options?.state ?? crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state
  });
  return `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  user_id?: number;
};

/**
 * Intercambiar código de autorización por access_token y refresh_token.
 */
export async function getTokenFromCode(code: string): Promise<TokenResponse> {
  const clientId = requireEnv("MERCADOLIBRE_CLIENT_ID");
  const clientSecret = requireEnv("MERCADOLIBRE_CLIENT_SECRET");
  const redirectUri = requireEnv("MERCADOLIBRE_REDIRECT_URI");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: code.trim(),
    redirect_uri: redirectUri
  });

  const res = await fetch(ML_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = `ML OAuth (${res.status}): ${errText}`;
    try {
      const json = JSON.parse(errText) as { message?: string; error_description?: string; error?: string };
      message = json.message ?? json.error_description ?? json.error ?? message;
    } catch {
      // usar errText completo si no es JSON
    }
    throw new Error(message);
  }

  const data = (await res.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("ML OAuth: respuesta sin access_token o refresh_token");
  }
  return data;
}

/**
 * Renovar access_token usando refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = requireEnv("MERCADOLIBRE_CLIENT_ID");
  const clientSecret = requireEnv("MERCADOLIBRE_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });

  const res = await fetch(ML_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ML OAuth refresh: ${res.status} ${err}`);
  }

  const data = (await res.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("ML OAuth refresh: respuesta sin access_token o refresh_token");
  }
  return data;
}

/**
 * Obtener user_id (seller_id) desde la API de ML con el access_token.
 */
export async function getMercadoLibreUserId(accessToken: string): Promise<number> {
  const res = await fetch(ML_USERS_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`ML users/me: ${res.status}`);
  const data = (await res.json()) as { id?: number };
  if (data.id == null) throw new Error("ML users/me: sin id");
  return data.id;
}

/**
 * Guardar credenciales OAuth en Supabase (una sola conexión: actualiza si existe, inserta si no).
 */
export async function saveMercadoLibreOAuth(params: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const expiresAt = new Date(Date.now() + params.expires_in * 1000).toISOString();
  const now = new Date().toISOString();
  const row = {
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    expires_at: expiresAt,
    user_id: params.user_id,
    updated_at: now
  };

  const { data: existing } = await supabase.from("mercadolibre_oauth").select("id").limit(1).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("mercadolibre_oauth").update(row).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("mercadolibre_oauth").insert({
      ...row,
      created_at: now
    });
    if (error) throw error;
  }
}

export type MercadoLibreOAuthRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user_id: number;
  created_at: string;
  updated_at: string;
};

/**
 * Obtener un access_token válido: si está por vencer o expirado, renueva con refresh_token y actualiza Supabase.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("mercadolibre_oauth")
    .select("access_token, refresh_token, expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !row) return null;

  const r = row as MercadoLibreOAuthRow;
  const expiresAt = new Date(r.expires_at).getTime();
  const now = Date.now();
  const bufferSeconds = 60;
  if (expiresAt > now + bufferSeconds * 1000) {
    return r.access_token;
  }

  const refreshed = await refreshAccessToken(r.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const updatedAt = new Date().toISOString();

  const { data: existing } = await supabase.from("mercadolibre_oauth").select("id").limit(1).maybeSingle();
  if (existing) {
    await supabase
      .from("mercadolibre_oauth")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: newExpiresAt,
        updated_at: updatedAt
      })
      .eq("id", (existing as { id: string }).id);
  }

  return refreshed.access_token;
}
