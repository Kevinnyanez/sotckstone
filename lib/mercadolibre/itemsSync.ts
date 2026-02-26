/**
 * Sincronización de publicaciones (items) y variaciones de Mercado Libre.
 * Usado por el webhook (topic items) y por el endpoint manual de sync.
 */

import { getSupabaseServerClient } from "../supabaseServer";

export type MercadoLibreVariation = {
  id?: string | number;
  available_quantity?: number;
  sold_quantity?: number;
  seller_custom_field?: string;
  attribute_combinations?: unknown[];
  attributes?: unknown[];
  [key: string]: unknown;
};

export type MercadoLibreItemResponse = {
  id: string;
  title?: string;
  status?: string;
  site_id?: string;
  category_id?: string;
  price?: number;
  currency_id?: string;
  permalink?: string;
  thumbnail?: string;
  seller_id?: number;
  available_quantity?: number;
  sold_quantity?: number;
  variations?: MercadoLibreVariation[];
  [key: string]: unknown;
};

export type UpsertItemResult = {
  itemInserted: boolean;
  itemUpdated: boolean;
  totalVariants: number;
  variantsInserted: number;
  variantsUpdated: number;
};

/** Firma estable para deduplicar variantes por atributos (ej. mismo "Talle 40" con distinto variation_id en ML). */
function getAttributeSignature(attrs: unknown): string {
  const list = Array.isArray(attrs) ? attrs : [];
  if (list.length === 0) return "";
  const parts: string[] = [];
  for (const a of list) {
    if (a && typeof a === "object" && "id" in a) {
      const id = String((a as { id?: string }).id ?? "").trim();
      const valueName = (a as { value_name?: string }).value_name ?? (a as { value_id?: string }).value_id ?? "";
      if (id) parts.push(`${id}=${String(valueName).trim()}`);
    }
  }
  parts.sort();
  return parts.join("|");
}

/**
 * Inserta/actualiza un item de ML y sus variaciones en mercadolibre_items / mercadolibre_variants.
 * - No toca product_id de mercadolibre_variants si ya existe una fila para esa variation_id.
 * - Si la variación no existe, se crea con product_id = null.
 */
export async function upsertMercadoLibreItemWithVariants(
  item: MercadoLibreItemResponse
): Promise<UpsertItemResult> {
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  // 1) Saber si el item ya existía
  const { data: existingItem } = await supabase
    .from("mercadolibre_items")
    .select("item_id")
    .eq("item_id", item.id)
    .maybeSingle();

  const itemRow = {
    item_id: item.id,
    title: item.title ?? null,
    status: item.status ?? null,
    site_id: item.site_id ?? null,
    category_id: item.category_id ?? null,
    price: item.price ?? null,
    currency_id: item.currency_id ?? null,
    permalink: item.permalink ?? null,
    thumbnail: item.thumbnail ?? null,
    seller_id: item.seller_id ?? null,
    available_quantity: item.available_quantity ?? null,
    sold_quantity: item.sold_quantity ?? null,
    raw: item as unknown as Record<string, unknown>,
    updated_at: now
  };

  const { error: itemError } = await supabase.from("mercadolibre_items").upsert(itemRow);
  if (itemError) {
    throw itemError;
  }

  const variations = item.variations ?? [];
  if (variations.length === 0) {
    return {
      itemInserted: !existingItem,
      itemUpdated: Boolean(existingItem),
      totalVariants: 0,
      variantsInserted: 0,
      variantsUpdated: 0
    };
  }

  // 2) Cargar variaciones existentes (con attributes para firma) y preservar product_id
  const { data: existingVars, error: varsError } = await supabase
    .from("mercadolibre_variants")
    .select("variation_id, product_id, attributes")
    .eq("item_id", item.id);
  if (varsError) {
    throw varsError;
  }

  const existingMap = new Map<string, { product_id: string | null }>();
  const existingBySignature = new Map<
    string,
    { variation_id: string; product_id: string | null }
  >();
  for (const v of existingVars ?? []) {
    const row = v as {
      variation_id: string;
      product_id: string | null;
      attributes?: unknown;
    };
    const key = String(row.variation_id).trim();
    if (key) existingMap.set(key, { product_id: row.product_id });
    const sig = getAttributeSignature(row.attributes);
    if (sig) {
      const current = existingBySignature.get(sig);
      const hasProduct = row.product_id != null && row.product_id !== "";
      if (!current || (hasProduct && (!current.product_id || current.product_id === ""))) {
        existingBySignature.set(sig, {
          variation_id: key || row.variation_id,
          product_id: row.product_id
        });
      }
    }
  }

  const upsertRows: {
    item_id: string;
    variation_id: string;
    product_id: string | null;
    seller_custom_field: string | null;
    available_quantity: number | null;
    sold_quantity: number | null;
    attributes: unknown;
    raw: unknown;
    updated_at: string;
  }[] = [];

  const signaturesFromSync = new Set<string>();
  let variantsInserted = 0;
  let variantsUpdated = 0;

  for (const v of variations) {
    if (v.id == null) continue;
    const variationId = String(v.id).trim();
    if (!variationId) continue;
    const attrs = v.attribute_combinations ?? v.attributes;
    const signature = getAttributeSignature(attrs);
    if (signature) signaturesFromSync.add(signature);

    const bySignature = existingBySignature.get(signature);
    const canonicalVariationId = bySignature?.variation_id ?? variationId;
    const productId =
      bySignature?.product_id ?? existingMap.get(variationId)?.product_id ?? null;

    if (existingMap.get(canonicalVariationId) ?? (canonicalVariationId === variationId && existingMap.get(variationId))) {
      variantsUpdated += 1;
    } else {
      variantsInserted += 1;
    }

    upsertRows.push({
      item_id: item.id,
      variation_id: canonicalVariationId,
      product_id: productId,
      seller_custom_field: v.seller_custom_field ?? null,
      available_quantity:
        typeof v.available_quantity === "number" ? v.available_quantity : null,
      sold_quantity: typeof v.sold_quantity === "number" ? v.sold_quantity : null,
      attributes: attrs ?? null,
      raw: v as unknown as Record<string, unknown>,
      updated_at: now
    });
  }

  // Deduplicar por variation_id: si ML devuelve la misma variación dos veces (o distinto variation_id para el mismo talle),
  // quedarnos con una sola fila y priorizar la que tiene product_id.
  let rowsToUpsert: typeof upsertRows = [];
  const deduped = new Map<
    string,
    {
      item_id: string;
      variation_id: string;
      product_id: string | null;
      seller_custom_field: string | null;
      available_quantity: number | null;
      sold_quantity: number | null;
      attributes: unknown;
      raw: unknown;
      updated_at: string;
    }
  >();
  for (const row of upsertRows) {
    const current = deduped.get(row.variation_id);
    const keepProductId =
      current?.product_id != null && current.product_id !== ""
        ? current.product_id
        : row.product_id != null && row.product_id !== ""
          ? row.product_id
          : null;
    deduped.set(row.variation_id, {
      ...row,
      product_id: keepProductId
    });
  }
  rowsToUpsert = Array.from(deduped.values());

  const keptVariationIds = new Set(rowsToUpsert.map((r) => r.variation_id));

  if (rowsToUpsert.length > 0) {
    for (const v of existingVars ?? []) {
      const row = v as {
        variation_id: string;
        product_id: string | null;
        attributes?: unknown;
      };
      const sig = getAttributeSignature(row.attributes);
      const variationIdTrimmed = String(row.variation_id).trim();
      const isDuplicateBySignature =
        sig && signaturesFromSync.has(sig) && !keptVariationIds.has(row.variation_id) && !keptVariationIds.has(variationIdTrimmed);
    const isTrimmedDuplicate =
      variationIdTrimmed !== row.variation_id && keptVariationIds.has(variationIdTrimmed);
    if (isDuplicateBySignature || isTrimmedDuplicate) {
        await supabase
          .from("mercadolibre_variants")
          .delete()
          .eq("variation_id", row.variation_id);
      }
    }
    const { error: upsertError } = await supabase
      .from("mercadolibre_variants")
      .upsert(rowsToUpsert, { onConflict: "variation_id" });
    if (upsertError) {
      throw upsertError;
    }
  }

  return {
    itemInserted: !existingItem,
    itemUpdated: Boolean(existingItem),
    totalVariants: rowsToUpsert.length,
    variantsInserted,
    variantsUpdated
  };
}

