import { NextResponse } from "next/server";
import { syncAllItemsForCurrentUser } from "../../../../lib/mercadolibre/api";

/**
 * Sincronización manual de publicaciones y variaciones de Mercado Libre.
 * POST /api/mercadolibre/sync-items
 */
export async function POST() {
  const result = await syncAllItemsForCurrentUser();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    total_items: result.total_items ?? 0,
    total_variants: result.total_variants ?? 0,
    inserted: result.inserted,
    updated: result.updated,
    used_public_search: result.used_public_search
  });
}

