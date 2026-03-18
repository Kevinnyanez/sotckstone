import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

type StockMovementsRow = {
  product_id: string;
  quantity: number | null;
};

type VariantRow = {
  item_id: string;
  variation_id: string;
  product_id: string | null;
  available_quantity: number | null;
};

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();

    const { data: variants, error: variantsError } = await supabase
      .from("external_variants")
      .select("product_id, external_item_id, external_variation_id")
      .eq("platform", "mercadolibre");

    if (variantsError) {
      return NextResponse.json({ error: variantsError.message }, { status: 500 });
    }

    const productIds = Array.from(
      new Set((variants ?? []).map((v) => v.product_id as string).filter(Boolean))
    );

    if (productIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const [{ data: products, error: productsError }, { data: stocks, error: stocksError }, { data: mlVariants, error: mlVariantsError }, { data: mlSales, error: mlSalesError }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, barcode, sku")
        .in("id", productIds),
      supabase
        .from("v_stock_current")
        .select("product_id, stock")
        .in("product_id", productIds),
      supabase
        .from("mercadolibre_variants")
        .select("item_id, variation_id, product_id, available_quantity"),
      supabase
        .from("stock_movements")
        .select("product_id, quantity")
        .in("product_id", productIds)
        .eq("channel", "MERCADOLIBRE")
        .eq("movement_type", "SALE_MERCADOLIBRE")
    ]);

    if (productsError) {
      return NextResponse.json({ error: productsError.message }, { status: 500 });
    }
    if (stocksError) {
      return NextResponse.json({ error: stocksError.message }, { status: 500 });
    }
    if (mlVariantsError) {
      return NextResponse.json({ error: mlVariantsError.message }, { status: 500 });
    }
    if (mlSalesError) {
      return NextResponse.json({ error: mlSalesError.message }, { status: 500 });
    }

    const stockMap = new Map((stocks ?? []).map((row: { product_id: string; stock: number | null }) => [row.product_id, Number(row.stock ?? 0)]));

    const linkKeyToProductId = new Map<string, string>();
    for (const v of variants ?? []) {
      const pid = v.product_id as string | null;
      const itemId = (v as { external_item_id?: string }).external_item_id;
      const varId = (v as { external_variation_id?: string }).external_variation_id;
      if (!pid || !itemId || !varId) continue;
      linkKeyToProductId.set(`${itemId}|${varId}`, pid);
    }

    const mlStockMap = new Map<string, number>();
    for (const row of (mlVariants ?? []) as VariantRow[]) {
      const key = `${row.item_id}|${row.variation_id}`;
      const linkedProductId = linkKeyToProductId.get(key);
      const effectiveProductId = linkedProductId ?? row.product_id;
      if (!effectiveProductId) continue;
      const current = mlStockMap.get(effectiveProductId) ?? 0;
      const qty = Number(row.available_quantity ?? 0);
      const safeQty = Number.isFinite(qty) ? qty : 0;
      mlStockMap.set(effectiveProductId, current + safeQty);
    }

    const mlSalesMap = new Map<string, number>();
    for (const row of (mlSales ?? []) as StockMovementsRow[]) {
      if (!row.product_id) continue;
      const delta = Number(row.quantity ?? 0);
      const sold = delta < 0 ? -delta : 0;
      const current = mlSalesMap.get(row.product_id) ?? 0;
      mlSalesMap.set(row.product_id, current + sold);
    }

    const items = (products ?? []).map((p: { id: string; name: string; barcode: string | null; sku: string | null }) => {
      const stockApp = Number.isFinite(Number(stockMap.get(p.id) ?? 0)) ? Number(stockMap.get(p.id) ?? 0) : 0;
      const stockMl = Number.isFinite(Number(mlStockMap.get(p.id) ?? 0)) ? Number(mlStockMap.get(p.id) ?? 0) : 0;
      const soldMl = Number.isFinite(Number(mlSalesMap.get(p.id) ?? 0)) ? Number(mlSalesMap.get(p.id) ?? 0) : 0;
      return {
        product_id: p.id,
        name: p.name,
        barcode: p.barcode ?? "",
        sku: p.sku ?? "",
        stock_app: stockApp,
        stock_ml: stockMl,
        ml_sold_quantity: soldMl,
        diff: stockApp - stockMl
      };
    });

    const soldItems = items.filter((item) => item.ml_sold_quantity > 0);

    return NextResponse.json({ items: soldItems });
  } catch (error) {
    console.error("[mercadolibre/ml-sales-status]", error);
    return NextResponse.json({ error: "No se pudo leer las ventas de Mercado Libre." }, { status: 500 });
  }
}
