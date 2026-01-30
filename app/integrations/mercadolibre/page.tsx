"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { getSupabaseClient } from "../../../lib/supabaseClient";
import { createMercadoLibreLink, deleteMercadoLibreLink } from "../../../lib/mercadolibre/actions";

type Product = {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  price: number | null;
};

type ExternalVariant = {
  id: string;
  product_id: string;
  platform: string;
  external_item_id: string;
  external_variation_id: string;
  created_at: string;
  products?: { name: string; barcode: string } | null;
};

export default function MercadoLibreIntegrationPage() {
  const supabase = getSupabaseClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [linked, setLinked] = useState<ExternalVariant[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [externalItemId, setExternalItemId] = useState("");
  const [externalVariationId, setExternalVariationId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [isPending, startTransition] = useTransition();

  const [simulateVariationId, setSimulateVariationId] = useState("");
  const [simulateQuantity, setSimulateQuantity] = useState(1);
  const [simulateReferenceId, setSimulateReferenceId] = useState("");
  const [simulateResult, setSimulateResult] = useState<{
    stock_before: number;
    stock_after: number;
    quantity_sold: number;
  } | null>(null);
  const [simulatePending, setSimulatePending] = useState(false);

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, sku, price")
      .order("name", { ascending: true });
    if (error) return;
    setProducts((data ?? []) as Product[]);
  }, [supabase]);

  const loadLinked = useCallback(async () => {
    const { data, error } = await supabase
      .from("external_variants")
      .select("id, product_id, platform, external_item_id, external_variation_id, created_at")
      .eq("platform", "mercadolibre")
      .order("created_at", { ascending: false });
    if (error) return;
    const rows = (data ?? []) as ExternalVariant[];
    if (rows.length === 0) {
      setLinked([]);
      return;
    }
    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const { data: productsData } = await supabase
      .from("products")
      .select("id, name, barcode")
      .in("id", productIds);
    const productMap = new Map(
      ((productsData ?? []) as { id: string; name: string; barcode: string }[]).map((p) => [p.id, p])
    );
    setLinked(
      rows.map((r) => ({
        ...r,
        products: productMap.get(r.product_id) ?? null
      }))
    );
  }, [supabase]);

  useEffect(() => {
    void loadProducts();
    void loadLinked();
  }, [loadProducts, loadLinked]);

  function showMsg(text: string, tone: "error" | "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  function handleCreateLink() {
    setMessage(null);
    if (!selectedProductId) {
      showMsg("Seleccioná un producto.", "error");
      return;
    }
    startTransition(async () => {
      const result = await createMercadoLibreLink(
        selectedProductId,
        externalItemId,
        externalVariationId
      );
      if (!result.ok) {
        showMsg(result.error ?? "Error al vincular.", "error");
        return;
      }
      showMsg("Vinculación creada.", "success");
      setExternalItemId("");
      setExternalVariationId("");
      setSelectedProductId("");
      void loadLinked();
    });
  }

  function handleDeleteLink(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteMercadoLibreLink(id);
      if (!result.ok) {
        showMsg(result.error ?? "Error al eliminar.", "error");
        return;
      }
      showMsg("Vinculación eliminada.", "success");
      void loadLinked();
    });
  }

  function handleSimulateSale() {
    setMessage(null);
    setSimulateResult(null);
    const variationId = simulateVariationId.trim();
    if (!variationId) {
      showMsg("Elegí una variante vinculada o ingresá external_variation_id.", "error");
      return;
    }
    setSimulatePending(true);
    fetch("/api/simulate/mercadolibre-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        external_variation_id: variationId,
        quantity: Math.max(1, Math.floor(simulateQuantity)) || 1,
        reference_id: simulateReferenceId.trim() || undefined
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setSimulateResult({
            stock_before: data.stock_before,
            stock_after: data.stock_after,
            quantity_sold: data.quantity_sold
          });
          showMsg(`Venta simulada: ${data.quantity_sold} unidad(es). Stock: ${data.stock_before} → ${data.stock_after}`, "success");
          void loadLinked();
        } else {
          showMsg(data.error ?? "Error al simular.", "error");
        }
      })
      .catch(() => showMsg("Error de conexión.", "error"))
      .finally(() => setSimulatePending(false));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Mercado Libre – Integración</h1>
            <p className="mt-1 text-sm text-slate-500">
              Vincular productos internos con variantes de ML (manual, sin OAuth).
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver al panel
          </Link>
        </header>

        {message && (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              messageTone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Vincular producto</h2>
          <p className="mt-1 text-sm text-slate-500">
            Elegí un producto interno e ingresá los IDs de ML (item y variación).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Producto interno</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Seleccionar...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">external_item_id (ML)</label>
              <input
                type="text"
                value={externalItemId}
                onChange={(e) => setExternalItemId(e.target.value)}
                placeholder="Ej: MLB123456789"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">external_variation_id (ML)</label>
              <input
                type="text"
                value={externalVariationId}
                onChange={(e) => setExternalVariationId(e.target.value)}
                placeholder="Ej: 12345678901"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateLink}
            disabled={isPending}
            className="mt-4 h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {isPending ? "Guardando..." : "Guardar vinculación"}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Productos vinculados a Mercado Libre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Lista de variantes externas asociadas a productos internos.
          </p>
          {linked.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No hay vinculaciones aún.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {linked.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                >
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">
                      {ev.products?.name ?? ev.product_id}
                    </span>
                    <span className="ml-2 text-slate-500">({ev.products?.barcode ?? "—"})</span>
                    <div className="mt-1 text-xs text-slate-500">
                      item: {ev.external_item_id} · variación: {ev.external_variation_id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLink(ev.id)}
                    disabled={isPending}
                    className="rounded border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Simular venta Mercado Libre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Descuenta stock como si hubiera llegado una venta de ML (para probar el flujo).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Variante (external_variation_id)</label>
              <select
                value={linked.some((ev) => ev.external_variation_id === simulateVariationId) ? simulateVariationId : ""}
                onChange={(e) => setSimulateVariationId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <option value="">Elegir vinculada...</option>
                {linked.map((ev) => (
                  <option key={ev.id} value={ev.external_variation_id}>
                    {ev.products?.name ?? ev.product_id} — {ev.external_variation_id}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={simulateVariationId}
                onChange={(e) => setSimulateVariationId(e.target.value)}
                placeholder="O escribir external_variation_id a mano"
                className="mt-2 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Cantidad</label>
              <input
                type="number"
                min={1}
                value={simulateQuantity}
                onChange={(e) => setSimulateQuantity(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">reference_id (opcional)</label>
              <input
                type="text"
                value={simulateReferenceId}
                onChange={(e) => setSimulateReferenceId(e.target.value)}
                placeholder="Ej: SIMULATED-ORDER-123"
                className="mt-1 h-10 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSimulateSale}
            disabled={simulatePending}
            className="mt-4 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-400"
          >
            {simulatePending ? "Simulando..." : "Simular venta ML"}
          </button>
          {simulateResult && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Stock antes: {simulateResult.stock_before} → después: {simulateResult.stock_after} (vendido: {simulateResult.quantity_sold})
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
