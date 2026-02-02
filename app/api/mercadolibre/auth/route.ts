import { NextResponse } from "next/server";
import { getAuthUrl } from "../../../../lib/mercadolibre/auth";

/**
 * Redirige al usuario a la pantalla de autorización de Mercado Libre.
 * Después de autorizar, ML redirige a MERCADOLIBRE_REDIRECT_URI (ej. /api/mercadolibre/callback).
 */
export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al iniciar OAuth";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
