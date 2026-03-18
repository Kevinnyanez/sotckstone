import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { syncProductStockToMercadoLibre } from "../../../../lib/mercadolibre/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productId = String(body?.productId ?? "").trim();

    if (!productId) {
      return NextResponse.json({ ok: false, error: "productId obligatorio" }, { status: 400 });
    }

    // validamos existence básica
    const supabase = getSupabaseServerClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return NextResponse.json({ ok: false, error: productError.message }, { status: 500 });
    }

    if (!product) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }

    const result = await syncProductStockToMercadoLibre(productId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[mercadolibre/sync-product-stock]", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
