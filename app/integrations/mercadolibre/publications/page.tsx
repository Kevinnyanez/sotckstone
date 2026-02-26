"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { getSupabaseClient } from "../../../../lib/supabaseClient";
import { createMercadoLibreLink } from "../../../../lib/mercadolibre/actions";

type MlItem = {
  item_id: string;
  title: string | null;
  status: string | null;
  updated_at: string;
};

type MlVariant = {
  id: string;
  item_id: string;
  variation_id: string;
  product_id: string | null;
  seller_custom_field: string | null;
  available_quantity: number | null;
  sold_quantity: number | null;
  attributes: unknown;
};

type LinkRow = {
  id: string;
  product_id: string;
  external_item_id: string;
  external_variation_id: string;
};

type ProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string;
};

type VariantWithLink = MlVariant & {
  link?: LinkRow | null;
  linkedProduct?: ProductSummary | null;
};

type ItemWithVariants = MlItem & {
  variants: VariantWithLink[];
};

type FilterMode = "all" | "linked" | "unlinked";

type SearchResultProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string;
  color?: string | null;
  size?: string | null;
  stock: number | null;
};

function formatAttributes(attrs: unknown): string {
  if (!attrs) return "";
  try {
    const arr = attrs as { name?: string; value_name?: string }[];
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const parts = arr
      .map((a) => {
        if (!a) return null;
        if (a.name && a.value_name) return `${a.name}: ${a.value_name}`;
        return a.value_name ?? a.name ?? null;
      })
      .filter(Boolean) as string[];
    return parts.join(" · ");
  } catch {
    return "";
  }
}

export default function MercadoLibrePublicationsPage() {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<ItemWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  const [linkTarget, setLinkTarget] = useState<{
    item: MlItem;
    variant: VariantWithLink;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultProduct[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isLinkPending, startLinkTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: itemsData, error: itemsError } = await supabase
          .from("mercadolibre_items")
          .select("item_id, title, status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(200);
        if (itemsError) throw itemsError;
        const itemsRows = (itemsData ?? []) as MlItem[];
        if (itemsRows.length === 0) {
          setItems([]);
          return;
        }

        const itemIds = itemsRows.map((i) => i.item_id);

        const { data: variantsData, error: variantsError } = await supabase
          .from("mercadolibre_variants")
          .select("id, item_id, variation_id, product_id, seller_custom_field, available_quantity, sold_quantity, attributes")
          .in("item_id", itemIds);
        if (variantsError) throw variantsError;
        const variants = (variantsData ?? []) as MlVariant[];

        const { data: linksData, error: linksError } = await supabase
          .from("external_variants")
          .select("id, product_id, external_item_id, external_variation_id")
          .eq("platform", "mercadolibre")
          .in("external_item_id", itemIds);
        if (linksError) throw linksError;
        const links = (linksData ?? []) as LinkRow[];

        const productIds = Array.from(new Set(links.map((l) => l.product_id)));
        let productsMap = new Map<string, ProductSummary>();
        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from("products")
            .select("id, name, sku, barcode")
            .in("id", productIds);
          if (productsError) throw productsError;
          productsMap = new Map(
            ((productsData ?? []) as ProductSummary[]).map((p) => [p.id, p])
          );
        }

        const linkMap = new Map<string, { link: LinkRow; product: ProductSummary | null }>();
        for (const l of links) {
          const key = `${l.external_item_id}|${l.external_variation_id}`;
          const prod = productsMap.get(l.product_id) ?? null;
          linkMap.set(key, { link: l, product: prod });
        }

        const itemsEnriched: ItemWithVariants[] = itemsRows.map((item) => {
          const itemVariants = variants
            .filter((v) => v.item_id === item.item_id)
            .map<VariantWithLink>((v) => {
              const linkInfo = linkMap.get(`${item.item_id}|${v.variation_id}`);
              return {
                ...v,
                link: linkInfo?.link ?? null,
                linkedProduct: linkInfo?.product ?? null
              };
            });
          return { ...item, variants: itemVariants };
        });

        setItems(itemsEnriched);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudieron cargar las publicaciones.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [supabase]);

  const summary = useMemo(() => {
    const totalItems = items.length;
    const allVariants = items.flatMap((i) => i.variants);
    const totalVariants = allVariants.length;
    const linked = allVariants.filter((v) => v.link && v.linkedProduct).length;
    const unlinked = totalVariants - linked;
    return { totalItems, totalVariants, linked, unlinked };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filterMode === "all") return items;
    return items.filter((item) => {
      const linkedCount = item.variants.filter((v) => v.link && v.linkedProduct).length;
      const unlinkedCount = item.variants.length - linkedCount;
      if (filterMode === "linked") return linkedCount > 0;
      return unlinkedCount > 0;
    });
  }, [items, filterMode]);

  function toggleExpanded(itemId: string) {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function closeLinkModal() {
    setLinkTarget(null);
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setSelectedProductId("");
    setLinkMessage(null);
    setLinkError(null);
  }

  async function handleSearchProducts() {
    setSearchError(null);
    setSearchResults(null);
    setSelectedProductId("");
    const q = searchQuery.trim();
    if (!q) {
      setSearchError("Ingresá un código, SKU o nombre.");
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/mercadolibre/search-products?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data?.error ?? "No se pudo buscar productos.");
        return;
      }
      const results = (data?.items ?? []) as SearchResultProduct[];
      setSearchResults(results);
      if (results.length === 1) {
        setSelectedProductId(results[0].id);
      }
    } catch {
      setSearchError("No se pudo buscar productos.");
    } finally {
      setSearchLoading(false);
    }
  }

  function handleConfirmLink() {
    if (!linkTarget || !selectedProductId) {
      setLinkError("Seleccioná un producto para vincular.");
      return;
    }
    setLinkError(null);
    setLinkMessage(null);
    startLinkTransition(async () => {
      try {
        const result = await createMercadoLibreLink(
          selectedProductId,
          linkTarget.item.item_id,
          linkTarget.variant.variation_id
        );
        if (!result.ok) {
          setLinkError(result.error ?? "No se pudo crear la vinculación.");
          return;
        }
        setLinkMessage("Vinculación creada correctamente.");
        // Refrescar datos para reflejar el estado vinculado.
        // Simplificamos recargando la página de publicaciones.
        window.location.reload();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo crear la vinculación.";
        setLinkError(msg);
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Mercado Libre – Publicaciones
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Revisá las publicaciones traídas desde Mercado Libre y vinculá cada variación con tus productos internos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/integrations/mercadolibre"
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver a integración
            </Link>
            <Link
              href="/"
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver al panel
            </Link>
          </div>
        </header>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Resumen de sincronización</p>
              <p className="mt-1 text-xs text-slate-500">
                Publicaciones: <span className="font-semibold">{summary.totalItems}</span> · Variantes:{" "}
                <span className="font-semibold">{summary.totalVariants}</span> · Variantes sin vincular:{" "}
                <span className="font-semibold">{summary.unlinked}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Vinculado
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                No vinculado
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-full px-3 py-1 font-medium ${
                filterMode === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("unlinked")}
              className={`rounded-full px-3 py-1 font-medium ${
                filterMode === "unlinked"
                  ? "bg-rose-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Solo no vinculados
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("linked")}
              className={`rounded-full px-3 py-1 font-medium ${
                filterMode === "linked"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Solo vinculados
            </button>
          </div>
        </section>

        {loading && (
          <p className="mt-4 text-sm text-slate-500">Cargando publicaciones de Mercado Libre…</p>
        )}
        {error && !loading && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No hay publicaciones para mostrar. Sincronizá desde la pantalla principal de integración.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {filteredItems.map((item) => {
            const isExpanded = expandedItemIds.has(item.item_id);
            const variantsLinked = item.variants.filter((v) => v.link && v.linkedProduct).length;
            const variantsUnlinked = item.variants.length - variantsLinked;
            return (
              <section
                key={item.item_id}
                className="rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(item.item_id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.title || "Sin título"}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {item.item_id}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Estado:{" "}
                      <span className="font-medium">
                        {item.status ?? "N/D"}
                      </span>{" "}
                      · Variantes: {item.variants.length} · Vinculadas: {variantsLinked} · Sin vincular:{" "}
                      {variantsUnlinked}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    Última sync:{" "}
                    {item.updated_at ? new Date(item.updated_at).toLocaleString() : "—"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-200 px-4 py-3">
                    {item.variants.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Esta publicación no tiene variaciones registradas.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {item.variants.map((v) => {
                          const attrsLabel = formatAttributes(v.attributes);
                          const isLinked = Boolean(v.link && v.linkedProduct);
                          return (
                            <li
                              key={v.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                                    Var {v.variation_id}
                                  </span>
                                  {attrsLabel && (
                                    <span className="truncate text-xs text-slate-600">
                                      {attrsLabel}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  ML stock:{" "}
                                  <span className="font-medium">
                                    {v.available_quantity ?? "N/D"}
                                  </span>{" "}
                                  · Vendido:{" "}
                                  <span className="font-medium">
                                    {v.sold_quantity ?? 0}
                                  </span>
                                  {v.seller_custom_field && (
                                    <>
                                      {" "}
                                      · SKU ML:{" "}
                                      <span>{v.seller_custom_field}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 text-xs">
                                <div className="inline-flex items-center gap-1 rounded-full px-2 py-0.5">
                                  <span
                                    className={`h-2 w-2 rounded-full ${
                                      isLinked ? "bg-emerald-500" : "bg-rose-500"
                                    }`}
                                  />
                                  <span
                                    className={
                                      isLinked ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"
                                    }
                                  >
                                    {isLinked ? "Vinculado" : "No vinculado"}
                                  </span>
                                </div>
                                {isLinked && v.linkedProduct && (
                                  <p className="text-[11px] text-slate-600">
                                    {v.linkedProduct.name}{" "}
                                    {v.linkedProduct.sku && (
                                      <span className="text-slate-500">({v.linkedProduct.sku})</span>
                                    )}
                                    <br />
                                    <span className="text-slate-500">
                                      Cód: {v.linkedProduct.barcode}
                                    </span>
                                  </p>
                                )}
                                {!isLinked && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLinkTarget({
                                        item,
                                        variant: v
                                      })
                                    }
                                    className="mt-1 rounded-md bg-teal-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
                                  >
                                    Vincular producto
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {linkTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
            <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Vincular variación con producto interno
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Publicación <span className="font-mono text-[11px]">{linkTarget.item.item_id}</span> ·
                    Variación <span className="font-mono text-[11px]">{linkTarget.variant.variation_id}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeLinkModal}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Buscar producto interno por código de barras, SKU o nombre
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ej: 779..., SKU-123, Remera negra M"
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleSearchProducts}
                      disabled={searchLoading}
                      className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {searchLoading ? "Buscando..." : "Buscar"}
                    </button>
                  </div>
                </div>

                {searchError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {searchError}
                  </p>
                )}

                {searchResults && searchResults.length === 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No se encontraron productos. Crear nuevo producto y volvé a intentar.
                  </p>
                )}

                {searchResults && searchResults.length > 0 && (
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                    {searchResults.map((p) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-white"
                      >
                        <input
                          type="radio"
                          name="ml-product-link"
                          value={p.id}
                          checked={selectedProductId === p.id}
                          onChange={() => setSelectedProductId(p.id)}
                          className="h-3 w-3"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{p.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {p.sku && <span>SKU: {p.sku} · </span>}
                            <span>Cód: {p.barcode || "N/D"}</span>
                            {p.color && p.size && (
                              <span>
                                {" "}
                                · {p.color} {p.size}
                              </span>
                            )}
                            {p.stock != null && <span> · Stock: {p.stock}</span>}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {linkError && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {linkError}
                  </p>
                )}
                {linkMessage && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {linkMessage}
                  </p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeLinkModal}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLink}
                  disabled={isLinkPending}
                  className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isLinkPending ? "Vinculando..." : "Confirmar vinculación"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

