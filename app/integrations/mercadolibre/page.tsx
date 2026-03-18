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

type MarketPlaceSaleItem = {
  product_id: string;
  name: string;
  barcode: string;
  sku: string;
  stock_app: number;
  stock_ml: number;
  ml_sold_quantity: number;
  diff: number;
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
  const [syncOrdersLoading, setSyncOrdersLoading] = useState(false);
  const [syncOrdersResult, setSyncOrdersResult] = useState<{
    ok: boolean;
    message?: string;
    processed?: number;
    duplicates?: number;
    errors?: number;
    orders_scanned?: number;
    processed_items?: { order_id: number; product_id: string; product_name: string; quantity: number }[];
  } | null>(null);
  const [stockStatusLoading, setStockStatusLoading] = useState(false);
  const [stockStatusError, setStockStatusError] = useState<string | null>(null);
  const [stockStatusItems, setStockStatusItems] = useState<
    {
      product_id: string;
      name: string;
      barcode: string;
      sku: string;
      stock_app: number;
      stock_ml: number;
      diff: number;
    }[]
  >([]);
  const [mlSalesLoading, setMlSalesLoading] = useState(false);
  const [mlSalesError, setMlSalesError] = useState<string | null>(null);
  const [mlSalesItems, setMlSalesItems] = useState<MarketPlaceSaleItem[]>([]);
  const [mlAdjustments, setMlAdjustments] = useState<Record<string, string>>({});
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  const [systemSalesLoading, setSystemSalesLoading] = useState(false);
  const [systemSalesError, setSystemSalesError] = useState<string | null>(null);
  const [systemSalesItems, setSystemSalesItems] = useState<
    {
      id: string;
      date: string;
      type: "SALE" | "EXCHANGE";
      channel: string;
      status: string;
      total_amount?: number;
      paid_amount?: number;
      difference_amount?: number;
      customer_name: string;
      note?: string | null;
    }[]
  >([]);
  const [salesPeriod, setSalesPeriod] = useState<"day" | "week" | "month" | "all">("day");
  const [salesDate, setSalesDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [showOnlyInconsistent, setShowOnlyInconsistent] = useState(false);
  const [syncStockLoading, setSyncStockLoading] = useState(false);
  const [syncStockResult, setSyncStockResult] = useState<{
    ok: boolean;
    total_products: number;
    updated: number;
    failed: number;
    errors?: { product_id: string; error: string }[];
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

  async function handleLoadStockStatus() {
    setStockStatusError(null);
    setStockStatusItems([]);
    setStockStatusLoading(true);
    try {
      const res = await fetch("/api/mercadolibre/stock-status");
      const data = await res.json();
      if (!res.ok) {
        setStockStatusError(data?.error ?? "No se pudo leer el estado de stock.");
        return;
      }
      setStockStatusItems((data?.items ?? []) as {
        product_id: string;
        name: string;
        barcode: string;
        sku: string;
        stock_app: number;
        stock_ml: number;
        diff: number;
      }[]);
    } catch {
      setStockStatusError("No se pudo leer el estado de stock.");
    } finally {
      setStockStatusLoading(false);
    }
  }

  async function handleLoadMlSales() {
    setMlSalesError(null);
    setMlSalesItems([]);
    setMlSalesLoading(true);
    try {
      const res = await fetch("/api/mercadolibre/ml-sales-status");
      const data = await res.json();
      if (!res.ok) {
        setMlSalesError(data?.error ?? "No se pudo leer las ventas de Mercado Libre.");
        return;
      }
      setMlSalesItems((data?.items ?? []) as MarketPlaceSaleItem[]);
    } catch {
      setMlSalesError("No se pudo leer las ventas de Mercado Libre.");
    } finally {
      setMlSalesLoading(false);
    }
  }

  async function handleLoadSystemSales() {
    setSystemSalesError(null);
    setSystemSalesItems([]);
    setSystemSalesLoading(true);
    try {
      const res = await fetch(
        `/api/mercadolibre/system-sales-status?period=${encodeURIComponent(salesPeriod)}&date=${encodeURIComponent(
          salesDate
        )}`
      );
      const data = await res.json();
      if (!res.ok) {
        setSystemSalesError(data?.error ?? "No se pudieron cargar las ventas del sistema.");
        return;
      }
      setSystemSalesItems((data?.items ?? []) as typeof systemSalesItems);
    } catch {
      setSystemSalesError("No se pudieron cargar las ventas del sistema.");
    } finally {
      setSystemSalesLoading(false);
    }
  }

  async function handleSyncProductStock(productId: string) {
    setUpdatingProductId(productId);
    try {
      const res = await fetch("/api/mercadolibre/sync-product-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showMsg(data?.error ?? "No se pudo sincronizar stock de producto a ML.", "error");
      } else {
        showMsg("Stock sincronizado a Mercado Libre exitosamente.", "success");
        void handleLoadStockStatus();
        void handleLoadMlSales();
      }
    } catch {
      showMsg("No se pudo sincronizar stock de producto a ML.", "error");
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleAdjustAndSync(productId: string) {
    const quantityRaw = mlAdjustments[productId] ?? "";
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity === 0) {
      showMsg("Ingresa una cantidad válida (puede ser positiva o negativa).", "error");
      return;
    }
    setUpdatingProductId(productId);
    try {
      const { error } = await supabase.from("stock_movements").insert({
        product_id: productId,
        movement_type: "ADJUSTMENT",
        quantity,
        reference_type: "ADJUSTMENT",
        reference_id: null,
        channel: "LOCAL"
      });
      if (error) {
        showMsg(`Error al ajustar stock local: ${error.message}`, "error");
        return;
      }
      showMsg("Stock local ajustado. Actualizando Mercado Libre…", "success");
      await handleSyncProductStock(productId);
      setMlAdjustments((prev) => ({ ...prev, [productId]: "" }));
    } catch {
      showMsg("Error al ajustar stock local.", "error");
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleSyncAllStock() {
    setSyncStockResult(null);
    setSyncStockLoading(true);
    try {
      const res = await fetch("/api/mercadolibre/sync-stock", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncStockResult({
          ok: false,
          total_products: 0,
          updated: 0,
          failed: 0
        });
        showMsg(data?.error ?? "No se pudo sincronizar stock con Mercado Libre.", "error");
        return;
      }
      setSyncStockResult({
        ok: data.ok,
        total_products: data.total_products ?? 0,
        updated: data.updated ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors
      });
      if (!data.ok) {
        showMsg("Algunos productos no pudieron sincronizarse con Mercado Libre.", "error");
      } else {
        showMsg("Stock sincronizado con Mercado Libre.", "success");
      }
    } catch {
      setSyncStockResult({
        ok: false,
        total_products: 0,
        updated: 0,
        failed: 0
      });
      showMsg("No se pudo sincronizar stock con Mercado Libre.", "error");
    } finally {
      setSyncStockLoading(false);
    }
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

  async function handleSyncOrders() {
    setSyncOrdersResult(null);
    setSyncOrdersLoading(true);
    try {
      const res = await fetch("/api/mercadolibre/sync-orders", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncOrdersResult({ ok: false, message: data?.error ?? "No se pudo sincronizar ventas." });
        return;
      }
      setSyncOrdersResult({
        ok: true,
        message: data.message,
        processed: data.processed,
        duplicates: data.duplicates,
        errors: data.errors,
        orders_scanned: data.orders_scanned,
        processed_items: data.processed_items
      });
    } catch {
      setSyncOrdersResult({ ok: false, message: "No se pudo sincronizar ventas." });
    } finally {
      setSyncOrdersLoading(false);
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
                  <button
                    type="button"
                    onClick={handleSyncOrders}
                    disabled={syncOrdersLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-600 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {syncOrdersLoading ? "Sincronizando…" : "Sincronizar ventas ML (descontar stock)"}
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadStockStatus}
                    disabled={stockStatusLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {stockStatusLoading
                      ? "Leyendo stock…"
                      : "Ver estado de stock (app vs ML)"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncAllStock}
                    disabled={syncStockLoading}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {syncStockLoading ? "Sincronizando stock…" : "Sincronizar stock actual con ML"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOnlyInconsistent((prev) => !prev)}
                    disabled={stockStatusItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-600 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {showOnlyInconsistent
                      ? "Ver todos los productos"
                      : "Ver solo productos con inconsistencia"}
                  </button>
                </div>
                {stockStatusError && (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {stockStatusError}
                  </p>
                )}
                {stockStatusItems.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-800">
                    <p className="mb-2 font-semibold">
                      Estado de stock actual (solo productos vinculados a ML)
                      {showOnlyInconsistent && " – mostrando solo inconsistencias (ML con stock, app en 0 o menos)"}
                    </p>
                    {showOnlyInconsistent && (
                      <p className="mb-1 text-[11px] text-rose-700">
                        Inconsistencia grave: Mercado Libre muestra stock (&gt; 0) y la app muestra 0 o menos (podés vender algo que no tenés).
                      </p>
                    )}
                    <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">
                              Producto
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">
                              Código / SKU
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">
                              Stock app
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">
                              Stock ML
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">
                              Dif. (app - ML)
                            </th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">
                              Estado
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(showOnlyInconsistent
                            ? stockStatusItems.filter((item) => item.stock_app <= 0 && item.stock_ml > 0)
                            : stockStatusItems
                          ).map((item) => (
                            <tr key={item.product_id} className="odd:bg-white even:bg-slate-50/60">
                              <td className="border-b border-slate-100 px-2 py-1">
                                <span className="font-medium">{item.name}</span>
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-xs text-slate-600">
                                {item.barcode || item.sku || "—"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">
                                {item.stock_app}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">
                                {item.stock_ml}
                              </td>
                              <td
                                className={`
                                  border-b border-slate-100 px-2 py-1 text-right tabular-nums
                                  ${
                                    item.diff < 0
                                      ? "text-rose-700"
                                      : item.diff > 0
                                        ? "text-emerald-700"
                                        : "text-slate-700"
                                  }
                                `}
                              >
                                {item.diff}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1">
                                {item.stock_app <= 0 && item.stock_ml > 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-rose-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-50">
                                    Inconsistencia (ML con stock)
                                  </span>
                                ) : item.stock_app <= 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-50">
                                    En 0
                                  </span>
                                ) : item.stock_ml <= 0 ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                                    Solo app con stock
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                                    Ambos con stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-600">
                      El botón “Sincronizar stock actual con ML” envía estos valores de stock como{" "}
                      <code className="rounded bg-slate-100 px-1">available_quantity</code> a las publicaciones vinculadas.
                    </p>
                  </div>
                )}

                <section className="mt-4 rounded-lg border border-sky-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Productos con ventas en ML</h3>
                    <button
                      type="button"
                      onClick={handleLoadMlSales}
                      disabled={mlSalesLoading}
                      className="h-9 rounded-lg border border-sky-500 bg-sky-50 px-3 text-xs font-semibold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mlSalesLoading ? "Cargando…" : "Cargar productos con ventas ML"}
                    </button>
                  </div>
                  {mlSalesError && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {mlSalesError}
                    </p>
                  )}
                  {mlSalesItems.length > 0 ? (
                    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Producto</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">SKU</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Stock app</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Stock ML</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Vendidos ML</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Dif</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mlSalesItems.map((item) => (
                            <tr key={item.product_id} className="odd:bg-white even:bg-slate-50/60">
                              <td className="border-b border-slate-100 px-2 py-1">{item.name}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-xs text-slate-600">{item.barcode || item.sku || "—"}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">{item.stock_app}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">{item.stock_ml}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">{item.ml_sold_quantity}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">{item.diff}</td>
                              <td className="border-b border-slate-100 px-2 py-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="number"
                                    value={mlAdjustments[item.product_id] ?? ""}
                                    onChange={(ev) =>
                                      setMlAdjustments((prev) => ({ ...prev, [item.product_id]: ev.target.value }))
                                    }
                                    placeholder="+/-"
                                    className="h-8 w-24 rounded-lg border border-slate-300 px-2 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustAndSync(item.product_id)}
                                    disabled={updatingProductId === item.product_id}
                                    className="h-8 rounded-lg bg-emerald-600 px-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {updatingProductId === item.product_id ? "Guardando…" : "Ajustar + sync app->ML"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSyncProductStock(item.product_id)}
                                    disabled={updatingProductId === item.product_id}
                                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {updatingProductId === item.product_id ? "Sincronizando…" : "Sincronizar solo ML"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No se encontraron productos con ventas en ML.</p>
                  )}
                </section>

                <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Ventas del sistema</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={salesPeriod}
                        onChange={(e) => setSalesPeriod(e.target.value as "day" | "week" | "month" | "all")}
                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                      >
                        <option value="day">Día</option>
                        <option value="week">Semana</option>
                        <option value="month">Mes</option>
                        <option value="all">Todas</option>
                      </select>
                      <input
                        type="date"
                        value={salesDate}
                        onChange={(e) => setSalesDate(e.target.value)}
                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleLoadSystemSales}
                        disabled={systemSalesLoading}
                        className="h-9 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {systemSalesLoading ? "Cargando…" : "Cargar ventas del sistema"}
                      </button>
                    </div>
                  </div>
                  {systemSalesError && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {systemSalesError}
                    </p>
                  )}
                  {systemSalesItems.length > 0 ? (
                    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Fecha</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Tipo</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Cliente</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Total</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Pagado</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium text-slate-700">Diferencia</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-700">Canal/estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemSalesItems.map((item) => (
                            <tr key={`${item.type}-${item.id}`} className="odd:bg-white even:bg-slate-50/60">
                              <td className="border-b border-slate-100 px-2 py-1">
                                {new Date(item.date).toLocaleString()}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1">{item.type}</td>
                              <td className="border-b border-slate-100 px-2 py-1">{item.customer_name}</td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">
                                {item.total_amount != null ? item.total_amount.toFixed(2) : "-"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">
                                {item.paid_amount != null ? item.paid_amount.toFixed(2) : "-"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">
                                {item.difference_amount != null ? item.difference_amount.toFixed(2) : "-"}
                              </td>
                              <td className="border-b border-slate-100 px-2 py-1">{item.channel} / {item.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No se encontraron ventas del sistema.</p>
                  )}
                </section>

                {syncStockResult && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      syncStockResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <p className="font-semibold">Resultado de sincronización de stock con Mercado Libre</p>
                    <p className="mt-1">
                      Productos vinculados: {syncStockResult.total_products} · Actualizados: {syncStockResult.updated} ·
                      Fallidos: {syncStockResult.failed}
                    </p>
                    {syncStockResult.errors && syncStockResult.errors.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] underline">
                          Ver errores por producto
                        </summary>
                        <ul className="mt-1 list-inside list-disc text-[11px]">
                          {syncStockResult.errors.map((e) => (
                            <li key={e.product_id}>
                              {e.product_id}: {e.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {syncOrdersResult && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      syncOrdersResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {syncOrdersResult.message}
                    {syncOrdersResult.ok && (
                      <>
                        <p className="mt-1 text-xs">
                          Órdenes revisadas: {syncOrdersResult.orders_scanned ?? 0} · Descontadas: {syncOrdersResult.processed ?? 0} ·
                          Ya existían: {syncOrdersResult.duplicates ?? 0} · Errores: {syncOrdersResult.errors ?? 0}
                        </p>
                        {syncOrdersResult.processed_items && syncOrdersResult.processed_items.length > 0 && (
                          <>
                            <p className="mt-2 text-xs font-medium">Descontado:</p>
                            <ul className="mt-0.5 list-inside list-disc text-xs">
                              {syncOrdersResult.processed_items.map((p, idx) => (
                                <li key={`${p.order_id}-${p.product_id}-${idx}`}>
                                  Orden ML {p.order_id} → {p.product_name} ({p.quantity})
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        <p className="mt-2 text-xs text-slate-600">
                          Para que cada venta en ML descuente automáticamente, configurá el webhook en la app de Mercado Libre (DevCenter): URL{" "}
                          <code className="rounded bg-white/80 px-1">/api/mercadolibre/webhook</code> y tema órdenes.
                        </p>
                      </>
                    )}
                  </div>
                )}
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
