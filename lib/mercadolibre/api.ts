/**
 * Mercado Libre – API (stock, ítems, etc.).
 * Preparado para: mapear product_id <-> external_variation_id y sincronizar stock.
 */

import { getSupabaseServerClient } from "../supabaseServer";
import { getValidAccessToken } from "./auth";

export const PLATFORM = "mercadolibre" as const;

export type ExternalVariantRow = {
  id: string;
  product_id: string;
  platform: string;
  external_item_id: string;
  external_variation_id: string;
  created_at: string;
};

/**
 * Obtener product_id a partir de external_variation_id (para ventas ML a futuro).
 */
export async function getProductIdByExternalVariation(
  platform: string,
  externalVariationId: string
): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("external_variants")
    .select("product_id")
    .eq("platform", platform)
    .eq("external_variation_id", externalVariationId)
    .maybeSingle();
  if (error) throw error;
  return data?.product_id ?? null;
}

/**
 * Listar productos vinculados a ML (listos para sincronizar stock).
 */
export async function getProductsLinkedToMercadoLibre(): Promise<ExternalVariantRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("external_variants")
    .select("*")
    .eq("platform", PLATFORM)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExternalVariantRow[];
}

/**
 * Sincronizar stock de un producto hacia Mercado Libre.
 * Implementación básica: obtiene el access_token válido, busca la variante externa
 * y hace un PUT a /items/{external_item_id} con available_quantity.
 *
 * Nota: La API real de ML para variaciones es más compleja (variations[*].available_quantity).
 * Esto cubre el caso simple (item sin variaciones o un único SKU). Ajustar según tu catálogo.
 */
export async function syncStockToMercadoLibre(
  productId: string,
  quantity: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { ok: false, error: "No hay token válido de Mercado Libre configurado." };
    }

    const supabase = getSupabaseServerClient();
    const { data: variants, error } = await supabase
      .from("external_variants")
      .select("external_item_id, external_variation_id")
      .eq("platform", PLATFORM)
      .eq("product_id", productId);

    if (error) {
      return { ok: false, error: error.message };
    }

    const list = (variants ?? []) as { external_item_id: string; external_variation_id: string }[];
    if (list.length === 0) {
      // Producto no vinculado a ML: nada que sincronizar.
      return { ok: true };
    }

    // Por simplicidad: asumimos un ítem por producto y actualizamos available_quantity del item.
    // Si usás variaciones, tendrás que adaptar el payload (variations[*].available_quantity).
    const [{ external_item_id }] = list;

    const res = await fetch(`https://api.mercadolibre.com/items/${external_item_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        available_quantity: quantity
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `ML stock update ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido al sincronizar stock con ML.";
    return { ok: false, error: msg };
  }
}

/**
 * Sincronizar stock de todos los productos vinculados a ML después de un movimiento local.
 * Útil para llamar después de una venta local que descuenta stock.
 * Placeholder: iteraría sobre getProductsLinkedToMercadoLibre() y syncStockToMercadoLibre().
 */
export async function syncAllLinkedStockToMercadoLibre(): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("external_variants")
    .select("product_id")
    .eq("platform", PLATFORM);
  if (error) return;
  const rows = (data ?? []) as { product_id: string }[];
  const uniqueIds = Array.from(new Set(rows.map((r) => r.product_id)));
  for (const productId of uniqueIds) {
    // No conocemos el stock actual desde aquí; esta función queda como helper para el futuro.
    // Podrías obtener el stock llamando a una RPC o vista y luego llamar a syncStockToMercadoLibre.
    void productId;
  }
}
