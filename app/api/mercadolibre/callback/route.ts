import { NextRequest, NextResponse } from "next/server";
import {
  getTokenFromCode,
  getMercadoLibreUserId,
  saveMercadoLibreOAuth
} from "../../../../lib/mercadolibre/auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code?.trim()) {
    return NextResponse.redirect(
      new URL("/integrations/mercadolibre?error=missing_code", request.url)
    );
  }

  try {
    const tokenResponse = await getTokenFromCode(code);
    let userId = tokenResponse.user_id;
    if (userId == null) {
      userId = await getMercadoLibreUserId(tokenResponse.access_token);
    }

    await saveMercadoLibreOAuth({
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_in: tokenResponse.expires_in,
      user_id: userId
    });

    return NextResponse.redirect(new URL("/integrations/mercadolibre/connected", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al conectar con Mercado Libre";
    const encoded = encodeURIComponent(message);
    return NextResponse.redirect(
      new URL(`/integrations/mercadolibre?error=${encoded}`, request.url)
    );
  }
}
