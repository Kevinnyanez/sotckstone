"use client";
 
 import Link from "next/link";
 import { useParams, useRouter } from "next/navigation";
 import { useEffect, useState, useTransition } from "react";
 import { getSupabaseClient } from "../../../../lib/supabaseClient";
 
 type StockRow = {
   product_id: string;
  stock: number | null;
 };
 
 export default function ProductStockPage() {
   const params = useParams<{ id: string }>();
   const productId = Array.isArray(params.id) ? params.id[0] : params.id;
   const supabase = getSupabaseClient();
   const router = useRouter();
   const [productName, setProductName] = useState<string>("");
   const [stock, setStock] = useState<number>(0);
   const [quantity, setQuantity] = useState<string>("");
   const [message, setMessage] = useState<string | null>(null);
   const [loading, setLoading] = useState<boolean>(false);
   const [isPending, startTransition] = useTransition();
 
   useEffect(() => {
     if (!productId) return;
     void loadProduct(productId);
   }, [productId]);
 
   async function loadProduct(id: string) {
     setLoading(true);
     const { data, error } = await supabase
       .from("products")
       .select("name")
       .eq("id", id)
       .maybeSingle();
     if (error || !data) {
       setMessage("No se pudo cargar el producto");
       setLoading(false);
       return;
     }
 
     setProductName(data.name ?? "");
 
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
 
   function handleSubmit() {
     setMessage(null);
     const parsed = Number(quantity);
     if (!Number.isFinite(parsed) || parsed === 0) {
       setMessage("Ingrese una cantidad válida (puede ser negativa).");
       return;
     }
 
     startTransition(async () => {
      const { error } = await supabase.from("stock_movements").insert([
        {
          product_id: productId,
          movement_type: "ADJUSTMENT",
          quantity: parsed,
          reference_type: "ADJUSTMENT",
          reference_id: null,
          channel: "LOCAL"
        }
      ]);
 
       if (error) {
         setMessage(`Error al ajustar stock: ${error.message}`);
         return;
       }
 
       router.push(`/products/${productId}`);
     });
   }
 
   return (
     <main className="min-h-screen bg-slate-100/80 text-slate-900">
       <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
         <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ajuste de stock</h1>
             <p className="mt-0.5 text-sm text-slate-500">
               Ajuste manual del inventario para el producto seleccionado.
             </p>
           </div>
           <Link
             href={`/products/${productId}`}
             className="text-sm font-semibold text-slate-600 hover:text-teal-700"
           >
             Volver a la ficha
           </Link>
         </header>

         <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
           {loading && (
             <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
               <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
               Cargando datos…
             </div>
           )}
           {!loading && (
             <div className="space-y-4">
               <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 px-4 py-4">
                 <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Producto</div>
                 <div className="mt-1 text-lg font-semibold text-slate-900">
                   {productName || "Sin nombre"}
                 </div>
                 <div className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                   Stock actual
                 </div>
                 <div className="mt-1 text-2xl font-bold tabular-nums text-teal-800">{stock}</div>
               </div>

               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Cantidad a ajustar (+/-)
                 <input
                   type="number"
                   value={quantity}
                   onChange={(e) => setQuantity(e.target.value)}
                   className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                   placeholder="Ej: -2 o 5"
                 />
               </label>
             </div>
           )}

           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}

           <div className="mt-6 flex flex-wrap gap-3">
             <button
               type="button"
               onClick={handleSubmit}
               disabled={isPending || loading}
               className="h-11 rounded-lg bg-teal-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
             >
               {isPending ? "Guardando…" : "Registrar ajuste"}
             </button>
             <Link
               href={`/products/${productId}`}
               className="h-11 rounded-lg border border-slate-300 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50"
             >
               Cancelar
             </Link>
           </div>
         </section>
       </div>
     </main>
   );
 }
