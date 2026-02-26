/**
 * Mercado Libre – API (stock, ítems, etc.).
 * Preparado para: mapear product_id <-> external_variation_id y sincronizar stock.
 */

import { getSupabaseServerClient } from "../supabaseServer";
import { getValidAccessToken } from "./auth";
import { upsertMercadoLibreItemWithVariants, MercadoLibreItemResponse } from "./itemsSync";

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
 * - Ítem sin variaciones: PUT con available_quantity.
 * - Ítem con variaciones: hay que enviar TODAS las variaciones en el PUT; si solo enviamos una,
 *   ML reemplaza el array y las demás quedan en 0. Por eso obtenemos el ítem actual, actualizamos
 *   solo la variación que corresponde a este producto y enviamos el array completo.
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
      return { ok: true };
    }

    const [{ external_item_id, external_variation_id }] = list;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    };

    if (!external_variation_id?.trim()) {
      // Ítem sin variaciones: actualizar available_quantity a nivel ítem.
      const res = await fetch(`https://api.mercadolibre.com/items/${external_item_id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ available_quantity: quantity })
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `ML stock update ${res.status}: ${text}` };
      }
      return { ok: true };
    }

    // Ítem con variaciones: GET ítem actual, armar array con todas las variaciones y solo cambiar la nuestra.
    const getRes = await fetch(`https://api.mercadolibre.com/items/${external_item_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!getRes.ok) {
      const text = await getRes.text();
      return { ok: false, error: `ML get item ${getRes.status}: ${text}` };
    }

    const item = (await getRes.json()) as { variations?: { id: number; available_quantity?: number }[] };
    const variations = item.variations ?? [];
    if (variations.length === 0) {
      // No hay variaciones en ML; fallback a available_quantity del ítem.
      const res = await fetch(`https://api.mercadolibre.com/items/${external_item_id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ available_quantity: quantity })
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `ML stock update ${res.status}: ${text}` };
      }
      return { ok: true };
    }

    const ourVarId = String(external_variation_id).trim();
    const variationsPayload = variations.map((v) => {
      const vid = String(v.id);
      const newQty = vid === ourVarId ? quantity : (v.available_quantity ?? 0);
      return { id: v.id, available_quantity: newQty };
    });

    const res = await fetch(`https://api.mercadolibre.com/items/${external_item_id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ variations: variationsPayload })
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
 * Sincronizar todas las publicaciones del vendedor (manual).
 * Recorre /users/{user_id}/items/search y luego /items/{item_id}, upserteando items y variaciones.
 */
export async function syncAllItemsForCurrentUser(): Promise<{
  ok: boolean;
  error?: string;
  total_items?: number;
  total_variants?: number;
  inserted?: { items: number; variants: number };
  updated?: { items: number; variants: number };
  used_public_search?: boolean;
}> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { ok: false, error: "No hay token válido de Mercado Libre configurado." };
    }

    const supabase = getSupabaseServerClient();
    const { data: oauthRow, error: oauthError } = await supabase
      .from("mercadolibre_oauth")
      .select("user_id")
      .limit(1)
      .maybeSingle();

    if (oauthError || !oauthRow) {
      return { ok: false, error: "No hay cuenta de Mercado Libre conectada." };
    }

    const userId = (oauthRow as { user_id: number }).user_id;

    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    const limit = 50;
    let offset = 0;
    let totalFromApi: number | undefined;
    const siteId = process.env.MERCADOLIBRE_SITE_ID?.trim() || "MLA";

    let totalItems = 0;
    let totalVariants = 0;
    let insertedItems = 0;
    let updatedItems = 0;
    let insertedVariants = 0;
    let updatedVariants = 0;

    type SearchResult = { results?: string[] | { id: string }[]; paging?: { total?: number } };
    let usePublicSearch = false;

    // Primera llamada: intentar endpoint privado /users/{user_id}/items/search
    const privateSearchUrl = new URL(
      `https://api.mercadolibre.com/users/${userId}/items/search`
    );
    privateSearchUrl.searchParams.set("limit", String(limit));
    privateSearchUrl.searchParams.set("offset", String(offset));
    const firstSearchRes = await fetch(privateSearchUrl.toString(), { headers });

    if (firstSearchRes.status === 403) {
      // Fallback: endpoint público por seller_id (solo listados activos). Requiere permiso "Read" en DevCenter para el privado.
      usePublicSearch = true;
    } else if (!firstSearchRes.ok) {
      const text = await firstSearchRes.text();
      return {
        ok: false,
        error: `Mercado Libre rechazó la solicitud (${firstSearchRes.status}). Revisá que la app tenga permiso de lectura de publicaciones en el DevCenter y que la cuenta conectada sea administrador del vendedor. Detalle: ${text}`
      };
    }

    async function fetchItemIds(
      off: number
    ): Promise<{ itemIds: string[]; total: number | undefined }> {
      if (usePublicSearch) {
        const url = new URL(
          `https://api.mercadolibre.com/sites/${siteId}/search`
        );
        url.searchParams.set("seller_id", String(userId));
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(off));
        const res = await fetch(url.toString());
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Búsqueda pública ML ${res.status}: ${text}`);
        }
        const json = (await res.json()) as SearchResult;
        const raw = json.results ?? [];
        const itemIds = raw.map((r) => (typeof r === "string" ? r : r.id));
        return {
          itemIds,
          total: json.paging?.total
        };
      }
      const url = new URL(
        `https://api.mercadolibre.com/users/${userId}/items/search`
      );
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(off));
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) throw new Error(`ML items search ${res.status}`);
      const json = (await res.json()) as SearchResult;
      const raw = json.results ?? [];
      const itemIds = raw.map((r) => (typeof r === "string" ? r : r.id));
      return {
        itemIds,
        total: json.paging?.total
      };
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { itemIds, total } = await fetchItemIds(offset);
      if (!totalFromApi && total != null) totalFromApi = total;
      if (itemIds.length === 0) break;

      totalItems += itemIds.length;

      for (const itemId of itemIds) {
        const itemRes = await fetch(
          `https://api.mercadolibre.com/items/${itemId}`,
          { headers }
        );
        if (!itemRes.ok) {
          const text = await itemRes.text();
          console.warn("[ML sync-items] Error al obtener item", {
            item_id: itemId,
            status: itemRes.status,
            body: text
          });
          continue;
        }

        const item = (await itemRes.json()) as MercadoLibreItemResponse;
        const result = await upsertMercadoLibreItemWithVariants(item);

        if (result.itemInserted) insertedItems += 1;
        if (result.itemUpdated) updatedItems += 1;
        totalVariants += result.totalVariants;
        insertedVariants += result.variantsInserted;
        updatedVariants += result.variantsUpdated;
      }

      offset += itemIds.length;
      if (totalFromApi != null && offset >= totalFromApi) break;
    }

    return {
      ok: true,
      total_items: totalItems,
      total_variants: totalVariants,
      inserted: { items: insertedItems, variants: insertedVariants },
      updated: { items: updatedItems, variants: updatedVariants },
      used_public_search: usePublicSearch
    };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error desconocido al sincronizar items de ML.";
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
