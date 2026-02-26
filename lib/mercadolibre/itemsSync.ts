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

  // 2) Cargar variaciones existentes para preservar product_id
  const { data: existingVars, error: varsError } = await supabase
    .from("mercadolibre_variants")
    .select("variation_id, product_id")
    .eq("item_id", item.id);
  if (varsError) {
    throw varsError;
  }

  const existingMap = new Map<string, { product_id: string | null }>();
  for (const v of existingVars ?? []) {
    const row = v as { variation_id: string; product_id: string | null };
    existingMap.set(row.variation_id, { product_id: row.product_id });
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

  let variantsInserted = 0;
  let variantsUpdated = 0;

  for (const v of variations) {
    if (v.id == null) continue;
    const variationId = String(v.id);
    const existing = existingMap.get(variationId);
    if (existing) {
      variantsUpdated += 1;
    } else {
      variantsInserted += 1;
    }

    upsertRows.push({
      item_id: item.id,
      variation_id: variationId,
      product_id: existing?.product_id ?? null,
      seller_custom_field: v.seller_custom_field ?? null,
      available_quantity:
        typeof v.available_quantity === "number" ? v.available_quantity : null,
      sold_quantity: typeof v.sold_quantity === "number" ? v.sold_quantity : null,
      attributes: (v.attribute_combinations ?? v.attributes) ?? null,
      raw: v as unknown as Record<string, unknown>,
      updated_at: now
    });
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase.from("mercadolibre_variants").upsert(upsertRows);
    if (upsertError) {
      throw upsertError;
    }
  }

  return {
    itemInserted: !existingItem,
    itemUpdated: Boolean(existingItem),
    totalVariants: upsertRows.length,
    variantsInserted,
    variantsUpdated
  };
}

