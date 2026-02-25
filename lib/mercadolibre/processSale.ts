/**
 * Mercado Libre – Procesamiento de venta (descuento de stock).
 * Lógica compartida entre webhook real y endpoint de simulación.
 * Idempotente por reference_id: evita doble descuento si el webhook se repite.
 */

import { getSupabaseServerClient } from "../supabaseServer";

const PLATFORM = "mercadolibre" as const;
const REFERENCE_TYPE = "MERCADOLIBRE_ORDER" as const;

export type ProcessMercadoLibreSaleParams = {
  externalVariationId: string;
  quantity: number;
  referenceId: string;
};

export type ProcessMercadoLibreSaleResult = {
  ok: boolean;
  duplicate?: boolean;
  product_id?: string;
  quantity_sold?: number;
  stock_before?: number;
  stock_after?: number;
  error?: string;
};

/**
 * Procesa una venta de Mercado Libre: descuenta stock del producto vinculado a la variante.
 * - Si ya existe un movimiento con el mismo reference_id (mismo tipo), no hace nada y devuelve ok + duplicate.
 * - Busca product_id por external_variation_id, valida stock, inserta stock_movements.
 */
export async function processMercadoLibreSale(
  params: ProcessMercadoLibreSaleParams
): Promise<ProcessMercadoLibreSaleResult> {
  const { externalVariationId, quantity, referenceId } = params;
  const variationIdTrimmed = externalVariationId.trim();
  const qty = Math.abs(Number(quantity)) || 1;
  const refId = referenceId.trim() || "UNKNOWN";

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("reference_type", REFERENCE_TYPE)
    .eq("reference_id", refId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: true, duplicate: true };
  }

  const { data: variant, error: variantError } = await supabase
    .from("external_variants")
    .select("product_id")
    .eq("platform", PLATFORM)
    .eq("external_variation_id", variationIdTrimmed)
    .maybeSingle();

  if (variantError) {
    return { ok: false, error: variantError.message };
  }

  if (!variant?.product_id) {
    return { ok: false, error: "Variante no vinculada a ningún producto." };
  }

  const { data: movements, error: movementsError } = await supabase
    .from("stock_movements")
    .select("quantity")
    .eq("product_id", variant.product_id);

  if (movementsError) {
    return { ok: false, error: movementsError.message };
  }

  const currentStock = (movements ?? []).reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0
  );
  if (currentStock < qty) {
    return {
      ok: false,
      error: `Stock insuficiente. Disponible: ${currentStock}, solicitado: ${qty}.`
    };
  }

  const { error: insertError } = await supabase.from("stock_movements").insert({
    product_id: variant.product_id,
    movement_type: "SALE_MERCADOLIBRE",
    type: "OUT",
    quantity: -qty,
    reference_type: REFERENCE_TYPE,
    reference_id: refId,
    note: "Venta Mercado Libre",
    channel: "MERCADOLIBRE"
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const newStock = currentStock - qty;
  return {
    ok: true,
    product_id: variant.product_id,
    quantity_sold: qty,
    stock_before: currentStock,
    stock_after: newStock
  };
}
