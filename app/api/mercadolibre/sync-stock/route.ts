import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { syncProductStockToMercadoLibre } from "../../../../lib/mercadolibre/actions";

export async function POST() {
  try {
    const supabase = getSupabaseServerClient();

    const { data: variants, error: variantsError } = await supabase
      .from("external_variants")
      .select("product_id")
      .eq("platform", "mercadolibre");

    if (variantsError) {
      return NextResponse.json(
        { ok: false, error: variantsError.message },
        { status: 500 }
      );
    }

    const productIds = Array.from(
      new Set((variants ?? []).map((v) => v.product_id as string).filter(Boolean))
    );

    if (productIds.length === 0) {
      return NextResponse.json({
        ok: true,
        total_products: 0,
        updated: 0,
        failed: 0
      });
    }

    console.log(
      "[mercadolibre/sync-stock] Iniciando sincronización de stock hacia ML para",
      productIds.length,
      "productos vinculados."
    );

    const results = await Promise.all(
      productIds.map(async (productId) => {
        const result = await syncProductStockToMercadoLibre(productId);
        return { productId, result };
      })
    );

    let updated = 0;
    let failed = 0;
    const errors: { product_id: string; error: string }[] = [];

    for (const entry of results) {
      if (entry.result.ok) {
        updated += 1;
      } else {
        failed += 1;
        errors.push({
          product_id: entry.productId,
          error: entry.result.error
        });
      }
    }

    if (failed === 0) {
      console.log(
        "[mercadolibre/sync-stock] Sincronización completada. Productos totales:",
        productIds.length,
        "Actualizados OK:",
        updated
      );
    } else {
      console.error(
        "[mercadolibre/sync-stock] Sincronización completada con errores.",
        "Totales:",
        productIds.length,
        "OK:",
        updated,
        "Fallidos:",
        failed,
        "Detalle de errores:",
        errors
      );
    }

    return NextResponse.json({
      ok: failed === 0,
      total_products: productIds.length,
      updated,
      failed,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error(
      "[mercadolibre/sync-stock] Error inesperado al sincronizar stock con ML:",
      error
    );
    return NextResponse.json(
      { ok: false, error: "No se pudo sincronizar el stock con Mercado Libre." },
      { status: 500 }
    );
  }
}

