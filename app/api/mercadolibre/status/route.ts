import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

/**
 * GET /api/mercadolibre/status
 * Devuelve el estado de la configuración OAuth (sin revelar secretos) para que
 * puedas testear que Client ID, Secret y Redirect URI están bien y si ya hay una cuenta conectada.
 */
export async function GET() {
  try {
    const clientId = process.env.MERCADOLIBRE_CLIENT_ID;
    const clientSecret = process.env.MERCADOLIBRE_CLIENT_SECRET;
    const redirectUri = process.env.MERCADOLIBRE_REDIRECT_URI ?? null;

    const supabase = getSupabaseServerClient();
    const { data: oauthRow } = await supabase
      .from("mercadolibre_oauth")
      .select("user_id, updated_at")
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      clientIdSet: Boolean(clientId?.trim()),
      secretSet: Boolean(clientSecret?.trim()),
      redirectUri: redirectUri?.trim() || null,
      connected: Boolean(oauthRow),
      userId: (oauthRow as { user_id?: number } | null)?.user_id ?? null,
      updatedAt: (oauthRow as { updated_at?: string } | null)?.updated_at ?? null
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al leer estado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
