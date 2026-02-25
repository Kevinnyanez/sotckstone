import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";
import { getValidAccessToken } from "../../../../lib/mercadolibre/auth";
import { processMercadoLibreSale } from "../../../../lib/mercadolibre/processSale";

type WebhookPayload = {
  topic?: string;
  resource?: string;
  resource_id?: string;
  user_id?: number;
  [key: string]: unknown;
};

type OrderItem = {
  item?: { id?: string; variation_id?: string | number };
  quantity?: number;
};

type OrderResponse = {
  id?: string | number;
  order_items?: OrderItem[];
};

function parseOrderIdFromResource(resource: string | undefined, resourceId: string | undefined): string | null {
  if (resourceId && String(resourceId).trim()) return String(resourceId).trim();
  if (!resource || typeof resource !== "string") return null;
  const match = resource.match(/\/orders\/(\d+)/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  let topic = "";
  let resource = "";

  try {
    const body = (await request.json()) as WebhookPayload;
    topic = String(body.topic ?? "").trim();
    resource = String(body.resource ?? "").trim();
    const resourceId = body.resource_id != null ? String(body.resource_id) : undefined;
    const webhookUserId = body.user_id != null ? Number(body.user_id) : undefined;

    console.log("[webhook ML] Recepción", { topic, resource, resource_id: resourceId });

    const supabase = getSupabaseServerClient();
    const { data: oauthRow, error: oauthError } = await supabase
      .from("mercadolibre_oauth")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    if (oauthError || !oauthRow) {
      console.warn("[webhook ML] Sin cuenta ML conectada o error al leer OAuth");
      return NextResponse.json({}, { status: 200 });
    }

    const storedUserId = (oauthRow as { user_id: number }).user_id;
    if (webhookUserId != null && storedUserId !== webhookUserId) {
      console.warn("[webhook ML] user_id del webhook no coincide con la cuenta conectada", {
        webhook_user_id: webhookUserId,
        stored_user_id: storedUserId
      });
      return NextResponse.json({}, { status: 200 });
    }

    if (topic !== "orders" && topic !== "marketplace_orders") {
      return NextResponse.json({}, { status: 200 });
    }

    const orderId = parseOrderIdFromResource(resource, resourceId);
    if (!orderId) {
      console.warn("[webhook ML] No se pudo extraer order_id de resource/resource_id", { resource, resource_id: resourceId });
      return NextResponse.json({}, { status: 200 });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.error("[webhook ML] No hay access_token válido para consultar la orden");
      return NextResponse.json({}, { status: 200 });
    }

    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!orderRes.ok) {
      console.error("[webhook ML] Error al consultar orden", { order_id: orderId, status: orderRes.status });
      return NextResponse.json({}, { status: 200 });
    }

    const order = (await orderRes.json()) as OrderResponse;
    const orderItems = order?.order_items ?? [];
    if (orderItems.length === 0) {
      console.log("[webhook ML] Orden sin ítems o estructura no esperada", { order_id: orderId });
      return NextResponse.json({}, { status: 200 });
    }

    const results: { index: number; ok: boolean; duplicate?: boolean; error?: string }[] = [];

    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const variationId = item?.item?.variation_id;
      const quantity = Math.abs(Number(item?.quantity ?? 1)) || 1;

      if (variationId == null || variationId === "") {
        console.warn("[webhook ML] Ítem sin variation_id", { order_id: orderId, index: i });
        results.push({ index: i, ok: false, error: "Sin variation_id" });
        continue;
      }

      const referenceId = `${orderId}-${i}`;
      const result = await processMercadoLibreSale({
        externalVariationId: String(variationId),
        quantity,
        referenceId
      });

      results.push({
        index: i,
        ok: result.ok,
        duplicate: result.duplicate,
        error: result.error
      });

      if (result.ok && !result.duplicate) {
        console.log("[webhook ML] Procesado ítem", {
          order_id: orderId,
          index: i,
          product_id: result.product_id,
          quantity_sold: result.quantity_sold
        });
      } else if (result.duplicate) {
        console.log("[webhook ML] Ítem ya procesado (duplicado)", { order_id: orderId, index: i });
      } else {
        console.warn("[webhook ML] Error al procesar ítem", { order_id: orderId, index: i, error: result.error });
      }
    }

    const failed = results.filter((r) => !r.ok);
    console.log("[webhook ML] Resultado procesamiento", {
      order_id: orderId,
      total_items: orderItems.length,
      processed: results.filter((r) => r.ok).length,
      duplicates: results.filter((r) => r.duplicate).length,
      errors: failed.length
    });

    return NextResponse.json({}, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    console.error("[webhook ML] Excepción", { topic, resource, error: message });
    return NextResponse.json({}, { status: 200 });
  }
}
