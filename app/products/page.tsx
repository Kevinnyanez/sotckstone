"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

const PAGE_SIZE = 15;

type ProductRow = {
  id: string;
  name: string;
  barcode: string;
  price: number | null;
  color: string | null;
};

type StockRow = {
  product_id: string;
  stock: number | null;
};

export default function ProductsPage() {
  const supabase = getSupabaseClient();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [pageIndex, setPageIndex] = useState(0);
 
  useEffect(() => {
    void loadProducts();
  }, []);
 
  async function loadProducts() {
     setMessage(null);
     setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, price, color")
      .order("name", { ascending: true });
     if (error) {
       setMessage("Error al cargar productos");
       setProducts([]);
       setLoading(false);
       return;
     }
 
     const items = (data ?? []) as ProductRow[];
     setProducts(items);
 
     if (items.length === 0) {
       setStocks({});
       setLoading(false);
       return;
     }
 
     const ids = items.map((item) => item.id);
     const { data: stockRows, error: stockError } = await supabase
       .from("v_stock_current")
      .select("product_id, stock")
       .in("product_id", ids);
     if (stockError) {
       setMessage("No se pudo cargar el stock actual");
       setStocks({});
       setLoading(false);
       return;
     }
 
     const next: Record<string, number> = {};
     for (const row of (stockRows ?? []) as StockRow[]) {
      const value = Number(row.stock ?? 0);
      next[row.product_id] = Number.isFinite(value) ? value : 0;
     }
     setStocks(next);
     setLoading(false);
   }

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.barcode.toLowerCase().includes(term)
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = useMemo(
    () =>
      filteredProducts.slice(
        pageIndex * PAGE_SIZE,
        pageIndex * PAGE_SIZE + PAGE_SIZE
      ),
    [filteredProducts, pageIndex]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [search]);

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Productos
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Listado con stock actual y acceso rápido a la ficha.
            </p>
          </div>
          <Link
            href="/products/new"
            className="shrink-0 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Nuevo producto
          </Link>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <label htmlFor="products-search" className="sr-only">
              Buscar producto
            </label>
            <input
              id="products-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o código de barras"
              className="h-10 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
              Cargando productos…
            </div>
          )}
          {!loading && products.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No hay productos registrados.
            </div>
          )}
          {!loading && products.length > 0 && filteredProducts.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No hay resultados para la búsqueda.
            </div>
          )}
          {!loading && paginatedProducts.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">
                        Precio
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Color
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">
                        Stock
                      </th>
                      <th className="w-24 px-4 py-3 text-right font-medium text-slate-600">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((product) => (
                      <tr
                        key={product.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${product.id}`}
                            className="font-medium text-slate-900 hover:text-teal-700"
                          >
                            {product.name}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {product.barcode}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {product.price !== null ? product.price.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {product.color ? (
                            <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {product.color}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          <span
                            className={
                              (stocks[product.id] ?? 0) > 0
                                ? "text-teal-700"
                                : "text-rose-600"
                            }
                          >
                            {stocks[product.id] ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/products/${product.id}`}
                            className="text-sm font-medium text-teal-700 hover:text-teal-800"
                          >
                            Ver ficha
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3">
                  <span className="text-xs text-slate-500">
                    {filteredProducts.length} producto{filteredProducts.length !== 1 ? "s" : ""}
                    {totalPages > 1 &&
                      ` · Página ${pageIndex + 1} de ${totalPages}`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                      disabled={pageIndex === 0}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={pageIndex >= totalPages - 1}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {message && (
            <div className="border-t border-slate-200 px-4 py-3">
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {message}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
