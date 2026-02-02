"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelSale } from "../../../lib/pos";
import { getSupabaseClient } from "../../../lib/supabaseClient";

type SaleRow = {
  id: string;
  sale_date: string | null;
  total_amount: number;
  paid_amount: number;
  is_fiado: boolean;
  customer_id: string | null;
  notes?: string | null;
  cancelled_at?: string | null;
};
 
 type SaleItemRow = {
   id: string;
   product_id: string;
   quantity: number;
   unit_price: number;
   total_price: number;
 };
 
 type CustomerRow = {
   id: string;
   full_name: string;
 };
 
 type ProductRow = {
   id: string;
   name: string;
   barcode: string;
 };
 
 function formatARS(value: number) {
   return new Intl.NumberFormat("es-AR", {
     style: "currency",
     currency: "ARS",
     maximumFractionDigits: 2
   }).format(value);
 }
 
 function extractPaymentMethod(notes?: string | null) {
   if (!notes) return "N/D";
   const match = notes.match(/Metodo:\s*([^|]+)/i);
   return match ? match[1].trim() : "N/D";
 }
 
 export default function SaleDetailPage() {
   const params = useParams<{ id: string }>();
   const saleId = Array.isArray(params.id) ? params.id[0] : params.id;
   const supabase = getSupabaseClient();
   const [sale, setSale] = useState<SaleRow | null>(null);
   const [items, setItems] = useState<SaleItemRow[]>([]);
   const [customerName, setCustomerName] = useState<string>("Sin cliente");
   const [products, setProducts] = useState<Record<string, ProductRow>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
     if (!saleId) return;
     void loadSale(saleId);
   }, [saleId]);
 
   async function loadSale(id: string) {
     setLoading(true);
     setMessage(null);
 
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .select("id, sale_date, total_amount, paid_amount, is_fiado, customer_id, notes, cancelled_at")
      .eq("id", id)
      .maybeSingle();
 
     if (saleError || !saleData) {
       setMessage("No se pudo cargar la venta");
       setLoading(false);
       return;
     }
 
     setSale(saleData as SaleRow);
 
     if (saleData.customer_id) {
       const { data: customerData } = await supabase
         .from("customers")
         .select("id, full_name")
         .eq("id", saleData.customer_id)
         .maybeSingle();
       if (customerData) {
         setCustomerName((customerData as CustomerRow).full_name);
       }
     }
 
     const { data: itemsData } = await supabase
       .from("sale_items")
       .select("id, product_id, quantity, unit_price, total_price")
       .eq("sale_id", id);
 
     const list = (itemsData ?? []) as SaleItemRow[];
     setItems(list);
 
     const productIds = Array.from(new Set(list.map((item) => item.product_id)));
     if (productIds.length > 0) {
       const { data: productsData } = await supabase
         .from("products")
         .select("id, name, barcode")
         .in("id", productIds);
       const map: Record<string, ProductRow> = {};
       for (const row of (productsData ?? []) as ProductRow[]) {
         map[row.id] = row;
       }
       setProducts(map);
     } else {
       setProducts({});
     }
 
     setLoading(false);
   }
 
  const isCancelled = Boolean(sale?.cancelled_at);
  const status = sale
    ? isCancelled
      ? "Anulada"
      : sale.paid_amount >= sale.total_amount
        ? "Pagada"
        : sale.paid_amount > 0
          ? "Parcial"
          : sale.is_fiado
            ? "Fiada"
            : "Pendiente"
    : "N/D";

  function handleCancelSale() {
    if (!saleId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelSale({ saleId });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setMessage("Venta anulada. Stock, caja y cuenta revertidos.");
      void loadSale(saleId);
    });
  }

  return (
     <main className="min-h-screen bg-slate-100/80 text-slate-900">
       <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
         <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Detalle de venta</h1>
             <p className="mt-0.5 text-sm text-slate-500">
               {sale?.sale_date
                 ? new Date(sale.sale_date).toLocaleString()
                 : "Fecha N/D"}
             </p>
             {isCancelled && (
               <span className="mt-2 inline-flex rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                 Anulada
               </span>
             )}
           </div>
           <div className="flex flex-wrap items-center gap-2">
             {!loading && sale && !isCancelled && (
               <button
                 type="button"
                 onClick={handleCancelSale}
                 disabled={isPending}
                 className="h-10 rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
               >
                 {isPending ? "Anulando…" : "Anular venta"}
               </button>
             )}
             <Link
               href="/sales"
               className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
             >
               Volver a ventas
             </Link>
           </div>
         </header>

         <section className="mb-6 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
           <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
             <h2 className="text-base font-semibold text-slate-900">Resumen</h2>
             {loading && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}
             {!loading && sale && (
               <div className="mt-4 space-y-2 text-sm text-slate-700">
                 <div className="flex items-center justify-between">
                   <span>Cliente</span>
                   <span className="font-semibold">{customerName}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span>Método</span>
                   <span className="font-semibold">
                     {extractPaymentMethod(sale.notes)}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span>Estado</span>
                   <span className={`font-semibold ${isCancelled ? "text-rose-600" : ""}`}>{status}</span>
                 </div>
                 <div className="mt-3 rounded-xl border-2 border-teal-200 bg-teal-50/50 px-4 py-4">
                   <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</div>
                   <div className="mt-2 text-3xl font-bold tabular-nums text-teal-800">
                     {formatARS(sale.total_amount)}
                   </div>
                 </div>
               </div>
             )}
           </div>

           <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
             <h2 className="text-base font-semibold text-slate-900">Pago</h2>
             {!loading && sale && (
               <div className="mt-4 space-y-2 text-sm text-slate-700">
                 <div className="flex items-center justify-between">
                   <span>Monto pagado</span>
                   <span className="font-semibold">
                     {formatARS(sale.paid_amount)}
                   </span>
                 </div>
                 <div className="flex items-center justify-between">
                   <span>Saldo</span>
                   <span className="font-semibold">
                     {formatARS(sale.total_amount - sale.paid_amount)}
                   </span>
                 </div>
               </div>
             )}
           </div>
         </section>
 
         <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
           <h2 className="text-base font-semibold text-slate-900">Items</h2>
           {items.length === 0 ? (
             <p className="mt-4 text-sm text-slate-500">
               No hay items registrados.
             </p>
           ) : (
             <div className="mt-4 overflow-x-auto">
               <table className="w-full border-collapse text-sm">
                 <thead>
                   <tr className="border-b border-slate-200 bg-slate-50/80">
                     <th className="px-4 py-3 text-left font-medium text-slate-600">Producto</th>
                     <th className="px-4 py-3 text-left font-medium text-slate-600">Código</th>
                     <th className="px-4 py-3 text-right font-medium text-slate-600">Cant.</th>
                     <th className="px-4 py-3 text-right font-medium text-slate-600">Precio</th>
                     <th className="px-4 py-3 text-right font-medium text-slate-600">Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   {items.map((item) => {
                     const product = products[item.product_id];
                     return (
                       <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                         <td className="px-4 py-3 font-medium text-slate-900">
                           {product?.name ?? item.product_id}
                         </td>
                         <td className="px-4 py-3 text-slate-500">
                           {product?.barcode ?? "N/D"}
                         </td>
                         <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                         <td className="px-4 py-3 text-right tabular-nums">
                           {formatARS(item.unit_price)}
                         </td>
                         <td className="px-4 py-3 text-right font-semibold tabular-nums">
                           {formatARS(item.total_price)}
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
           {message && (
             <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
               message.includes("revertidos") ? "border-teal-200 bg-teal-50 text-teal-800" : "border-rose-200 bg-rose-50 text-rose-700"
             }`}>
               {message}
             </p>
           )}
         </section>
       </div>
     </main>
   );
 }
