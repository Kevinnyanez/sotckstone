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
  const [configStatus, setConfigStatus] = useState<{
    clientIdSet?: boolean;
    secretSet?: boolean;
    redirectUri?: string | null;
    connected?: boolean;
    userId?: number | null;
    updatedAt?: string | null;
    error?: string;
  } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    total_items: number;
    total_variants: number;
    inserted?: { items: number; variants: number };
    updated?: { items: number; variants: number };
    used_public_search?: boolean;
  } | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mercadolibre/status")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setConfigStatus(data);
      })
      .catch(() => {
        if (!cancelled) setConfigStatus({ error: "No se pudo leer el estado" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function showMsg(text: string, tone: "error" | "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function handleSyncItems() {
    setSyncError(null);
    setSyncSummary(null);
    setSyncLoading(true);
    try {
      const res = await fetch("/api/mercadolibre/sync-items", {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSyncError(data?.error ?? "No se pudo sincronizar publicaciones.");
        return;
      }
      setSyncSummary({
        total_items: data.total_items ?? 0,
        total_variants: data.total_variants ?? 0,
        inserted: data.inserted,
        updated: data.updated,
        used_public_search: data.used_public_search
      });
    } catch {
      setSyncError("No se pudo sincronizar publicaciones.");
    } finally {
      setSyncLoading(false);
    }
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
              Conectá tu cuenta, sincronizá publicaciones y vinculá variantes con tus productos internos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/integrations/mercadolibre/publications"
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Ver publicaciones
            </Link>
            <Link
              href="/"
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver al panel
            </Link>
          </div>
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

        {(syncError || syncSummary) && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              syncError
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {syncError && <p className="font-medium">{syncError}</p>}
            {syncSummary && !syncError && (
              <div>
                <p className="font-semibold">Sincronización completada.</p>
                <p className="mt-1">
                  Publicaciones: <span className="font-medium">{syncSummary.total_items}</span> · Variantes:{" "}
                  <span className="font-medium">{syncSummary.total_variants}</span>
                </p>
                {(syncSummary.inserted || syncSummary.updated) && (
                  <p className="mt-1 text-xs text-emerald-900/80">
                    Nuevos: {syncSummary.inserted?.items ?? 0} items / {syncSummary.inserted?.variants ?? 0} variantes ·
                    Actualizados: {syncSummary.updated?.items ?? 0} items / {syncSummary.updated?.variants ?? 0} variantes
                  </p>
                )}
                {syncSummary.used_public_search && (
                  <p className="mt-1 text-xs text-amber-800">
                    Se usó búsqueda pública (solo publicaciones activas). Para listar todas las publicaciones, configurá el permiso de lectura en el DevCenter de Mercado Libre y volvé a conectar la cuenta.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {configStatus && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Testear conexión OAuth</h2>
            <p className="mt-1 text-sm text-slate-500">
              Verificá que Client ID, Secret y Redirect URI estén bien antes de que un usuario conecte.
            </p>
            {configStatus.error ? (
              <p className="mt-4 text-sm text-rose-600">{configStatus.error}</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={configStatus.clientIdSet ? "text-emerald-600" : "text-amber-600"}>
                    {configStatus.clientIdSet ? "✓" : "✗"}
                  </span>
                  <span>Client ID: {configStatus.clientIdSet ? "configurado" : "falta en .env"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={configStatus.secretSet ? "text-emerald-600" : "text-amber-600"}>
                    {configStatus.secretSet ? "✓" : "✗"}
                  </span>
                  <span>Secret: {configStatus.secretSet ? "configurado" : "falta en .env"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={configStatus.redirectUri ? "text-emerald-600" : "text-amber-600"}>
                    {configStatus.redirectUri ? "✓" : "✗"}
                  </span>
                  <span>Redirect URI: </span>
                  {configStatus.redirectUri ? (
                    <code className="rounded bg-slate-100 px-2 py-0.5 text-xs break-all">
                      {configStatus.redirectUri}
                    </code>
                  ) : (
                    <span className="text-amber-600">falta en .env (MERCADOLIBRE_REDIRECT_URI)</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Este valor debe coincidir exactamente con la Redirect URI en la app de Mercado Libre (DevCenter).
                </p>
                {configStatus.connected ? (
                  <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                    Cuenta ya conectada (user_id: {configStatus.userId ?? "—"}
                    {configStatus.updatedAt
                      ? ` · actualizado ${new Date(configStatus.updatedAt).toLocaleString()}`
                      : ""}
                    ). Podés volver a conectar para refrescar el token.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="/api/mercadolibre/auth"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
                  >
                    Abrir flujo OAuth en nueva pestaña
                  </a>
                  <button
                    type="button"
                    onClick={handleSyncItems}
                    disabled={syncLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {syncLoading ? "Sincronizando..." : "Sincronizar publicaciones ahora"}
                  </button>
                </div>
                <ol className="list-inside list-decimal space-y-1 text-slate-600">
                  <li>Clic en el botón de arriba.</li>
                  <li>Iniciá sesión en Mercado Libre si te lo pide.</li>
                  <li>Autorizá la aplicación.</li>
                  <li>Deberías volver a esta app en <strong>/integrations/mercadolibre/connected</strong>.</li>
                </ol>
              </div>
            )}
          </section>
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

        {/* La vinculación se gestiona ahora desde /integrations/mercadolibre/publications */}
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
