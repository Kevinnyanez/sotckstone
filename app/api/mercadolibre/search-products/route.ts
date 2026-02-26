import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

/**
 * Buscar productos internos por código de barras, SKU o nombre.
 * GET /api/mercadolibre/search-products?q=...
 * Devuelve una lista acotada con stock calculado.
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ items: [] });
    }
    const term = `%${q}%`;
    const supabase = getSupabaseServerClient();

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, name, sku, barcode, color, size")
      .or(`barcode.ilike.${term},sku.ilike.${term},name.ilike.${term}`)
      .limit(30);
    if (productsError) {
      throw productsError;
    }
    const products = (productsData ?? []) as {
      id: string;
      name: string;
      sku: string | null;
      barcode: string;
      color: string | null;
      size: string | null;
    }[];
    if (products.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const productIds = products.map((p) => p.id);
    const { data: stockRows, error: stockError } = await supabase
      .from("stock_movements")
      .select("product_id, quantity")
      .in("product_id", productIds);
    if (stockError) {
      throw stockError;
    }

    const stockMap = new Map<string, number>();
    for (const id of productIds) stockMap.set(id, 0);
    for (const row of stockRows ?? []) {
      const current = stockMap.get(row.product_id) ?? 0;
      stockMap.set(row.product_id, current + Number(row.quantity ?? 0));
    }

    return NextResponse.json({
      items: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        color: p.color,
        size: p.size,
        stock: stockMap.get(p.id) ?? 0
      }))
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al buscar productos internos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

