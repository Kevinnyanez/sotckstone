import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const externalVariationId = body.external_variation_id as string | undefined;
    const quantity = Math.abs(Number(body.quantity ?? 1)) || 1;
    const referenceId =
      typeof body.reference_id === "string" && body.reference_id.trim()
        ? body.reference_id.trim()
        : "SIMULATED";

    if (!externalVariationId || typeof externalVariationId !== "string") {
      return NextResponse.json(
        { ok: false, error: "external_variation_id es obligatorio." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: variant, error: variantError } = await supabase
      .from("external_variants")
      .select("product_id")
      .eq("platform", "mercadolibre")
      .eq("external_variation_id", externalVariationId.trim())
      .maybeSingle();

    if (variantError) {
      return NextResponse.json(
        { ok: false, error: variantError.message },
        { status: 500 }
      );
    }

    if (!variant?.product_id) {
      return NextResponse.json(
        { ok: false, error: "Variante no vinculada a ningún producto." },
        { status: 404 }
      );
    }

    const { data: movements, error: movementsError } = await supabase
      .from("stock_movements")
      .select("quantity")
      .eq("product_id", variant.product_id);

    if (movementsError) {
      return NextResponse.json(
        { ok: false, error: movementsError.message },
        { status: 500 }
      );
    }

    const currentStock = (movements ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
    if (currentStock < quantity) {
      return NextResponse.json(
        { ok: false, error: `Stock insuficiente. Disponible: ${currentStock}, solicitado: ${quantity}.` },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from("stock_movements").insert({
      product_id: variant.product_id,
      movement_type: "SALE_MERCADOLIBRE",
      type: "OUT",
      quantity: -quantity,
      reference_type: "MERCADOLIBRE_ORDER",
      reference_id: referenceId,
      note: "Simulated Mercado Libre sale",
      channel: "MERCADOLIBRE"
    });

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    const newStock = currentStock - quantity;

    return NextResponse.json({
      ok: true,
      product_id: variant.product_id,
      quantity_sold: quantity,
      stock_before: currentStock,
      stock_after: newStock,
      reference_id: referenceId
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al simular venta.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
