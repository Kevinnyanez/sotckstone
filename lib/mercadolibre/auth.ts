/**
 * Mercado Libre – Autenticación (OAuth).
 * Placeholder: sin OAuth ni llamadas reales aún.
 * Preparado para integrar App ID, Secret y flujo de autorización.
 */

export const PLATFORM = "mercadolibre" as const;

/**
 * URL de autorización para que el usuario conecte su cuenta ML.
 * TODO: implementar con App ID y redirect_uri cuando se active OAuth.
 */
export function getAuthUrl(_options?: { state?: string }): string {
  // Placeholder: no implementado aún
  return "";
}

/**
 * Intercambiar código de autorización por access_token y refresh_token.
 * TODO: implementar cuando se active OAuth.
 */
export async function getTokenFromCode(_code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  throw new Error("OAuth no implementado aún");
}

/**
 * Renovar access_token usando refresh_token.
 * TODO: implementar cuando se active OAuth.
 */
export async function refreshToken(_refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  throw new Error("OAuth no implementado aún");
}
