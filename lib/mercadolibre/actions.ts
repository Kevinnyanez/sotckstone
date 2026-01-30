"use server";

import { getSupabaseServerClient } from "../supabaseServer";

const PLATFORM = "mercadolibre";

export type LinkResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createMercadoLibreLink(
  productId: string,
  externalItemId: string,
  externalVariationId: string
): Promise<LinkResult> {
  const supabase = getSupabaseServerClient();

  const trimmedItem = externalItemId.trim();
  const trimmedVariation = externalVariationId.trim();
  if (!trimmedItem || !trimmedVariation) {
    return { ok: false, error: "external_item_id y external_variation_id son obligatorios." };
  }

  const { data: existing } = await supabase
    .from("external_variants")
    .select("id")
    .eq("platform", PLATFORM)
    .eq("external_variation_id", trimmedVariation)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "Ya existe una vinculación con ese external_variation_id." };
  }

  const { error } = await supabase.from("external_variants").insert({
    product_id: productId,
    platform: PLATFORM,
    external_item_id: trimmedItem,
    external_variation_id: trimmedVariation
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ese producto ya está vinculado o ese external_variation_id ya existe." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteMercadoLibreLink(id: string): Promise<LinkResult> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("external_variants").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
