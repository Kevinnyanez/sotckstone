"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";
import { createMercadoLibreLink, deleteMercadoLibreLink } from "../../../lib/mercadolibre/actions";

const LINKED_PAGE_SIZE = 10;

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

function MercadoLibreIntegrationContent() {
  const supabase = getSupabaseClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [linked, setLinked] = useState<ExternalVariant[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [externalItemId, setExternalItemId] = useState("");
  const [externalVariationId, setExternalVariationId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [isPending, startTransition] = useTransition();

  const [linkedFilter, setLinkedFilter] = useState("");
  const [linkedPageIndex, setLinkedPageIndex] = useState(0);
  const searchParams = useSearchParams();

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

  const filteredLinked = useMemo(() => {
    const term = linkedFilter.trim().toLowerCase();
    if (!term) return linked;
    return linked.filter(
      (ev) =>
        (ev.products?.name ?? "").toLowerCase().includes(term) ||
        (ev.products?.barcode ?? "").toLowerCase().includes(term)
    );
  }, [linked, linkedFilter]);

  const linkedTotalPages = Math.max(1, Math.ceil(filteredLinked.length / LINKED_PAGE_SIZE));
  const paginatedLinked = useMemo(
    () =>
      filteredLinked.slice(
        linkedPageIndex * LINKED_PAGE_SIZE,
        linkedPageIndex * LINKED_PAGE_SIZE + LINKED_PAGE_SIZE
      ),
    [filteredLinked, linkedPageIndex]
  );

  useEffect(() => {
    setLinkedPageIndex(0);
  }, [linkedFilter]);

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Mercado Libre – Integración
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Vincular productos internos con variantes de ML (manual, sin OAuth).
            </p>
          </div>
          <Link
            href="/"
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Volver al panel
          </Link>
        </header>

        {searchParams.get("error") && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
            <p className="font-medium">
              {decodeURIComponent(searchParams.get("error") ?? "")}
            </p>
            <p className="mt-2 text-xs text-rose-600/90">
              Causas frecuentes: la <strong>Redirect URI</strong> en tu app de Mercado Libre debe coincidir exactamente con <code className="rounded bg-rose-100 px-1">MERCADOLIBRE_REDIRECT_URI</code> (ej. https://tu-dominio.com/api/mercadolibre/callback). La cuenta con la que autorizás debe ser <strong>administrador</strong> de la aplicación en el DevCenter de ML.
            </p>
          </div>
        )}
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
          <h2 className="text-lg font-semibold text-slate-900">Conexión con Mercado Libre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Conectá tu cuenta de Mercado Libre para usar la integración (OAuth).
          </p>
          <a
            href="/api/mercadolibre/auth"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Conectar Mercado Libre
          </a>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Vincular producto</h2>
          <p className="mt-1 text-sm text-slate-500">
            Elegí un producto interno e ingresá los IDs de ML (item y variación).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Producto interno</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
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
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">external_variation_id (ML)</label>
              <input
                type="text"
                value={externalVariationId}
                onChange={(e) => setExternalVariationId(e.target.value)}
                placeholder="Ej: 12345678901"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateLink}
            disabled={isPending}
            className="mt-4 h-10 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isPending ? "Guardando..." : "Guardar vinculación"}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">Productos vinculados a Mercado Libre</h2>
          <p className="mt-1 text-sm text-slate-500">
            Lista de variantes externas asociadas a productos internos.
          </p>
          {linked.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No hay vinculaciones aún.</p>
          ) : (
            <>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Buscar por nombre o código de barras
              </label>
              <input
                type="text"
                value={linkedFilter}
                onChange={(e) => setLinkedFilter(e.target.value)}
                placeholder="Filtrar..."
                className="mt-1.5 h-10 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
              <ul className="mt-4 space-y-2">
                {paginatedLinked.map((ev) => (
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
              {linkedTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                  <span className="text-xs text-slate-500">
                    {filteredLinked.length} vinculación{filteredLinked.length !== 1 ? "es" : ""}
                    {linkedTotalPages > 1 && ` · Página ${linkedPageIndex + 1} de ${linkedTotalPages}`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLinkedPageIndex((p) => Math.max(0, p - 1))}
                      disabled={linkedPageIndex === 0}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkedPageIndex((p) => Math.min(linkedTotalPages - 1, p + 1))}
                      disabled={linkedPageIndex >= linkedTotalPages - 1}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MercadoLibreIntegrationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100/80 text-slate-900">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            <p className="text-sm text-slate-500">Cargando…</p>
          </div>
        </main>
      }
    >
      <MercadoLibreIntegrationContent />
    </Suspense>
  );
}
