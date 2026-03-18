import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

type StockRow = {
  product_id: string;
  stock: number | null;
};

type MlVariantRow = {
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
      return NextResponse.json(
        { error: variantsError.message },
        { status: 500 }
      );
    }

    const productIds = Array.from(
      new Set((variants ?? []).map((v) => v.product_id as string).filter(Boolean))
    );

    if (productIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const [
      { data: products, error: productsError },
      { data: stocks, error: stocksError },
      { data: mlVariants, error: mlVariantsError }
    ] = await Promise.all([
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
        .select("item_id, variation_id, product_id, available_quantity")
    ]);

    if (productsError) {
      return NextResponse.json(
        { error: productsError.message },
        { status: 500 }
      );
    }
    if (stocksError) {
      return NextResponse.json({ error: stocksError.message }, { status: 500 });
    }
    if (mlVariantsError) {
      return NextResponse.json(
        { error: mlVariantsError.message },
        { status: 500 }
      );
    }

    const stockMap = new Map(
      ((stocks ?? []) as StockRow[]).map((row) => [row.product_id, row.stock])
    );

    const linkKeyToProductId = new Map<string, string>();
    for (const v of variants ?? []) {
      const pid = v.product_id as string | null;
      const itemId = (v as { external_item_id?: string }).external_item_id;
      const varId = (v as { external_variation_id?: string }).external_variation_id;
      if (!pid || !itemId || !varId) continue;
      const key = `${itemId}|${varId}`;
      linkKeyToProductId.set(key, pid);
    }

    const mlStockMap = new Map<string, number>();
    for (const row of (mlVariants ?? []) as MlVariantRow[]) {
      const key = `${row.item_id}|${row.variation_id}`;
      const linkedProductId = linkKeyToProductId.get(key);
      const effectiveProductId = linkedProductId ?? row.product_id ?? null;
      if (!effectiveProductId) continue;
      const current = mlStockMap.get(effectiveProductId) ?? 0;
      const qty = Number(row.available_quantity ?? 0);
      const safeQty = Number.isFinite(qty) ? qty : 0;
      mlStockMap.set(effectiveProductId, current + safeQty);
    }

    const items = (products ?? []).map((p) => {
      const raw = stockMap.get(p.id) ?? 0;
      const value = Number(raw ?? 0);
      const stockApp = Number.isFinite(value) ? value : 0;

      const mlRaw = mlStockMap.get(p.id) ?? 0;
      const mlValue = Number(mlRaw ?? 0);
      const stockMl = Number.isFinite(mlValue) ? mlValue : 0;

      return {
        product_id: p.id,
        name: p.name,
        barcode: p.barcode,
        sku: p.sku,
        stock_app: stockApp,
        stock_ml: stockMl,
        diff: stockApp - stockMl
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo leer el estado de stock." },
      { status: 500 }
    );
  }
}

