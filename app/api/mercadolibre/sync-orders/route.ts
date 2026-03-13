/**
 * Sincroniza ventas de Mercado Libre: obtiene órdenes recientes y descuenta stock
 * para las que aún no se había procesado el webhook (ej. webhook no configurado o fallas).
 * Idempotente: si una orden ya se procesó (reference_id en stock_movements), no descuenta de nuevo.
 */

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { getValidAccessToken } from "../../../../lib/mercadolibre/auth";
import { processMercadoLibreSale } from "../../../../lib/mercadolibre/processSale";

type OrderSearchResult = {
  results?: (number | { id?: number })[];
  paging?: { total?: number; limit?: number; offset?: number };
};

type OrderItem = {
  item?: { id?: string; variation_id?: string | number };
  quantity?: number;
};

type OrderDetail = {
  id?: number;
  order_items?: OrderItem[];
};

export async function POST() {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: "No hay token válido de Mercado Libre configurado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: oauthRow, error: oauthError } = await supabase
      .from("mercadolibre_oauth")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    if (oauthError || !oauthRow) {
      return NextResponse.json(
        { error: "No hay cuenta de Mercado Libre conectada." },
        { status: 400 }
      );
    }

    const sellerId = (oauthRow as { user_id: number }).user_id;
    const headers = { Authorization: `Bearer ${accessToken}` };

    const limit = 50;
    const searchUrl = new URL("https://api.mercadolibre.com/orders/search");
    searchUrl.searchParams.set("seller", String(sellerId));
    searchUrl.searchParams.set("limit", String(limit));

    const searchRes = await fetch(searchUrl.toString(), { headers });
    if (!searchRes.ok) {
      const text = await searchRes.text();
      return NextResponse.json(
        { error: `Mercado Libre órdenes: ${searchRes.status}. ${text}` },
        { status: 502 }
      );
    }

    const searchData = (await searchRes.json()) as OrderSearchResult;
    const rawResults = searchData.results ?? [];
    const orderIds = rawResults.map((r) => (typeof r === "number" ? r : (r && typeof r === "object" && (r as { id?: number }).id) ?? null)).filter((id): id is number => id != null);
    if (orderIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay órdenes recientes para procesar.",
        processed: 0,
        duplicates: 0,
        errors: 0
      });
    }

    let processed = 0;
    let duplicates = 0;
    let errors = 0;
    const processedItems: { order_id: number; product_id: string; quantity: number }[] = [];

    for (const orderId of orderIds) {
      const orderRes = await fetch(
        `https://api.mercadolibre.com/orders/${orderId}`,
        { headers }
      );
      if (!orderRes.ok) continue;

      const order = (await orderRes.json()) as OrderDetail;
      const orderItems = order?.order_items ?? [];

      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i];
        const variationId = item?.item?.variation_id;
        const quantity = Math.abs(Number(item?.quantity ?? 1)) || 1;

        if (variationId == null || variationId === "") continue;

        const referenceId = `${orderId}-${i}`;
        const result = await processMercadoLibreSale({
          externalVariationId: String(variationId),
          quantity,
          referenceId
        });

        if (result.ok && result.duplicate) duplicates += 1;
        else if (result.ok && result.product_id) {
          processed += 1;
          processedItems.push({
            order_id: orderId,
            product_id: result.product_id,
            quantity: result.quantity_sold ?? quantity
          });
        } else if (result.ok) processed += 1;
        else errors += 1;
      }
    }

    const productIds = [...new Set(processedItems.map((p) => p.product_id))];
    let productNames: Record<string, string> = {};
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds);
      productNames = Object.fromEntries(
        ((products ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name ?? p.id])
      );
    }

    const processed_items = processedItems.map((p) => ({
      order_id: p.order_id,
      product_id: p.product_id,
      product_name: productNames[p.product_id] ?? p.product_id,
      quantity: p.quantity
    }));

    return NextResponse.json({
      ok: true,
      message: `Sincronización de órdenes ML. Procesadas: ${processed}, ya existían: ${duplicates}, errores: ${errors}.`,
      processed,
      duplicates,
      errors,
      orders_scanned: orderIds.length,
      processed_items
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
