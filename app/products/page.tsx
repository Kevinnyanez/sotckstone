"use client";
 
 import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
 import { getSupabaseClient } from "../../lib/supabaseClient";
 
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
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Productos</h1>
             <p className="mt-1 text-sm text-slate-500">
               Listado con stock actual y acceso rápido a la ficha.
             </p>
           </div>
           <Link
             href="/products/new"
             className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
           >
             Nuevo producto
           </Link>
         </header>
 
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">
                Buscar producto
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre o barcode"
                className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
           {loading && (
             <p className="text-sm text-slate-500">Cargando productos...</p>
           )}
           {!loading && products.length === 0 && (
             <p className="text-sm text-slate-500">
               No hay productos registrados.
             </p>
           )}
          {!loading && products.length > 0 && (
             <div className="overflow-x-auto">
               <table className="w-full border-collapse text-sm">
                 <thead className="text-left text-slate-500">
                   <tr className="border-b border-slate-200">
                     <th className="py-2 font-medium">Producto</th>
                    <th className="py-2 font-medium">Precio</th>
                    <th className="py-2 font-medium">Color</th>
                     <th className="py-2 text-right font-medium">Stock</th>
                     <th className="py-2"></th>
                   </tr>
                 </thead>
                 <tbody>
                  {filteredProducts.map((product) => (
                     <tr
                       key={product.id}
                       className="border-b border-slate-100"
                     >
                       <td className="py-3 font-medium">
                         <Link
                           href={`/products/${product.id}`}
                           className="text-slate-900 hover:text-slate-700"
                         >
                           {product.name}
                         </Link>
                        <div className="text-xs text-slate-500">
                          {product.barcode}
                        </div>
                       </td>
                      <td className="py-3 text-slate-600">
                        {product.price !== null ? product.price.toFixed(2) : "N/D"}
                      </td>
                      <td className="py-3">
                        {product.color ? (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                            {product.color}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin color</span>
                        )}
                      </td>
                       <td className="py-3 text-right font-semibold">
                        <span
                          className={
                            (stocks[product.id] ?? 0) > 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }
                        >
                          {stocks[product.id] ?? 0}
                        </span>
                       </td>
                       <td className="py-3 text-right">
                         <Link
                           href={`/products/${product.id}`}
                           className="text-sm font-semibold text-slate-700 hover:text-slate-900"
                         >
                           Ver ficha
                         </Link>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           )}
           {message && (
             <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
         </section>
       </div>
     </main>
   );
 }
