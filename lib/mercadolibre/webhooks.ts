/**
 * Mercado Libre – Webhooks (notificaciones de pedidos, etc.).
 * Placeholder: sin validación ni llamadas reales.
 * Preparado para: recibir notificación de venta ML → mapear external_variation_id a product_id → generar OUT con channel MERCADOLIBRE.
 */

import { getProductIdByExternalVariation } from "./api";

export const PLATFORM = "mercadolibre" as const;

export type OrderNotificationPayload = {
  id?: string;
  user_id?: number;
  topic?: string;
  resource?: string;
  application_id?: number;
  attempts?: number;
  sent?: string;
  received?: string;
  /** ID del pedido en ML (para reference_id en stock_movements). */
  order_id?: string;
  /** ID de la variación vendida (para mapear a product_id). */
  external_variation_id?: string;
  [key: string]: unknown;
};

/**
 * Procesar notificación de pedido de Mercado Libre.
 * Placeholder: no inserta stock_movements ni llama a la API; solo valida y mapea.
 * A futuro: obtener external_variation_id del payload → getProductIdByExternalVariation → insertar OUT con channel MERCADOLIBRE y reference_id = order_id.
 */
export async function handleOrderNotification(
  payload: OrderNotificationPayload
): Promise<{ ok: boolean; productId?: string; error?: string }> {
  const variationId = payload.external_variation_id ?? (payload as { variation_id?: string }).variation_id;
  if (!variationId || typeof variationId !== "string") {
    return { ok: false, error: "external_variation_id no presente en el payload" };
  }
  const productId = await getProductIdByExternalVariation(PLATFORM, variationId);
  if (!productId) {
    return { ok: false, error: "Variante no vinculada a ningún producto local" };
  }
  // TODO: insertar stock_movements OUT con channel MERCADOLIBRE, reference_id = order_id
  return { ok: true, productId };
}
