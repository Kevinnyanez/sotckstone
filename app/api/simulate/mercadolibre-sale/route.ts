import { NextRequest, NextResponse } from "next/server";
import { processMercadoLibreSale } from "../../../../lib/mercadolibre/processSale";

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

    const result = await processMercadoLibreSale({
      externalVariationId,
      quantity,
      referenceId
    });

    if (!result.ok) {
      const status =
        result.error === "Variante no vinculada a ningún producto."
          ? 404
          : result.error?.startsWith("Stock insuficiente")
            ? 400
            : 500;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      product_id: result.product_id,
      quantity_sold: result.quantity_sold,
      stock_before: result.stock_before,
      stock_after: result.stock_after,
      reference_id: referenceId
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al simular venta.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
