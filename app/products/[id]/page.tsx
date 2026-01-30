"use client";
 
 import Link from "next/link";
 import { useParams } from "next/navigation";
 import { useEffect, useState } from "react";
 import { getSupabaseClient } from "../../../lib/supabaseClient";
 
 type ProductDetail = {
   id: string;
   name: string;
  sku: string | null;
   barcode: string;
   price: number | null;
  cost: number | null;
   size: string | null;
   color: string | null;
   brand: string | null;
 };
 
 type StockRow = {
   product_id: string;
  stock: number | null;
 };
 
 export default function ProductDetailPage() {
   const params = useParams<{ id: string }>();
   const productId = Array.isArray(params.id) ? params.id[0] : params.id;
   const supabase = getSupabaseClient();
   const [product, setProduct] = useState<ProductDetail | null>(null);
   const [stock, setStock] = useState<number>(0);
   const [message, setMessage] = useState<string | null>(null);
   const [loading, setLoading] = useState<boolean>(false);
 
   useEffect(() => {
     if (!productId) return;
     void loadProduct(productId);
   }, [productId]);
 
   async function loadProduct(id: string) {
     setMessage(null);
     setLoading(true);
    const { data, error } = await supabase
       .from("products")
      .select("id, name, sku, barcode, price, cost, size, color, brand")
       .eq("id", id)
       .maybeSingle();
 
     if (error || !data) {
       setMessage("No se pudo cargar el producto");
       setProduct(null);
       setLoading(false);
       return;
     }
 
     setProduct(data as ProductDetail);
 
    const { data: stockRow } = await supabase
       .from("v_stock_current")
      .select("product_id, stock")
       .eq("product_id", id)
       .maybeSingle();
 
    const raw = (stockRow as StockRow | null) ?? null;
    const value = Number(raw?.stock ?? 0);
    setStock(Number.isFinite(value) ? value : 0);
     setLoading(false);
   }
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">
               {product?.name ?? "Producto"}
             </h1>
             <p className="mt-1 text-sm text-slate-500">Ficha del producto</p>
           </div>
           <div className="flex flex-wrap gap-3">
             <Link
               href={`/products/${productId}/edit`}
               className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
             >
               Editar producto
             </Link>
             <Link
               href={`/products/${productId}/stock`}
               className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
             >
               Ajustar stock
             </Link>
           </div>
         </header>
 
         <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
           {loading && (
             <p className="text-sm text-slate-500">Cargando ficha...</p>
           )}
           {!loading && product && (
             <div className="grid gap-6 md:grid-cols-2">
               <div className="space-y-3">
                 <div>
                   <div className="text-xs uppercase text-slate-500">Nombre</div>
                   <div className="text-lg font-semibold">{product.name}</div>
                 </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">SKU</div>
                  <div className="text-base text-slate-700">
                    {product.sku ?? "Sin dato"}
                  </div>
                </div>
                 <div>
                   <div className="text-xs uppercase text-slate-500">Barcode</div>
                   <div className="text-base text-slate-700">{product.barcode}</div>
                 </div>
                 <div>
                   <div className="text-xs uppercase text-slate-500">Marca</div>
                   <div className="text-base text-slate-700">
                     {product.brand ?? "Sin dato"}
                   </div>
                 </div>
                 <div>
                   <div className="text-xs uppercase text-slate-500">Color</div>
                   <div className="text-base text-slate-700">
                     {product.color ?? "Sin dato"}
                   </div>
                 </div>
                 <div>
                   <div className="text-xs uppercase text-slate-500">Talle</div>
                   <div className="text-base text-slate-700">
                     {product.size ?? "Sin dato"}
                   </div>
                 </div>
               </div>
               <div className="space-y-3">
                 <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                   <div className="text-xs uppercase text-slate-500">Stock actual</div>
                   <div className="mt-2 text-3xl font-semibold text-slate-900">
                     {stock}
                   </div>
                 </div>
                 <div>
                   <div className="text-xs uppercase text-slate-500">Precio</div>
                   <div className="text-base text-slate-700">
                     {product.price !== null ? product.price.toFixed(2) : "N/D"}
                   </div>
                 </div>
                 <div>
                  <div className="text-xs uppercase text-slate-500">Costo</div>
                   <div className="text-base text-slate-700">
                    {product.cost !== null
                      ? product.cost.toFixed(2)
                      : "N/D"}
                   </div>
                 </div>
               </div>
             </div>
           )}
           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
         </section>
 
         <Link
           href="/products"
           className="text-sm font-semibold text-slate-600 hover:text-slate-900"
         >
           Volver al listado
         </Link>
       </div>
     </main>
   );
 }
