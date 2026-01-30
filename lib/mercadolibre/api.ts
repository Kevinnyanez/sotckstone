/**
 * Mercado Libre – API (stock, ítems, etc.).
 * Placeholder: sin llamadas reales a la API de ML.
 * Preparado para: mapear product_id <-> external_variation_id y sincronizar stock.
 */

import { getSupabaseServerClient } from "../supabaseServer";

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
 * Placeholder: no llama a la API de ML aún; solo deja la estructura lista.
 * TODO: cuando OAuth y API estén activos, llamar a PUT /items/{item_id} con available_quantity.
 */
export async function syncStockToMercadoLibre(
  _productId: string,
  _quantity: number
): Promise<{ ok: boolean; error?: string }> {
  // Placeholder: no implementado aún
  return { ok: true };
}

/**
 * Sincronizar stock de todos los productos vinculados a ML después de un movimiento local.
 * Útil para llamar después de una venta local que descuenta stock.
 * Placeholder: iteraría sobre getProductsLinkedToMercadoLibre() y syncStockToMercadoLibre().
 */
export async function syncAllLinkedStockToMercadoLibre(): Promise<void> {
  // Placeholder: no implementado aún
}
