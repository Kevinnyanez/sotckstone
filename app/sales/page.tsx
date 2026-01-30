 "use client";
 
 import Link from "next/link";
 import { useEffect, useMemo, useState } from "react";
 import { getSupabaseClient } from "../../lib/supabaseClient";
 
 type SaleRow = {
   id: string;
   sale_date: string | null;
   total_amount: number;
   paid_amount: number;
   is_fiado: boolean;
   customer_id: string | null;
   notes?: string | null;
 };
 
 type CustomerRow = {
   id: string;
   full_name: string;
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
 
 export default function SalesPage() {
   const supabase = getSupabaseClient();
   const [sales, setSales] = useState<SaleRow[]>([]);
   const [customers, setCustomers] = useState<Record<string, string>>({});
   const [loading, setLoading] = useState(false);
   const [message, setMessage] = useState<string | null>(null);
 
   useEffect(() => {
     void loadSales();
   }, []);
 
   async function loadSales() {
     setLoading(true);
     setMessage(null);
     const { data, error } = await supabase
       .from("sales")
       .select("id, sale_date, total_amount, paid_amount, is_fiado, customer_id, notes")
       .order("sale_date", { ascending: false });
 
     if (error) {
       setMessage("No se pudieron cargar las ventas");
       setSales([]);
       setLoading(false);
       return;
     }
 
     const list = (data ?? []) as SaleRow[];
     setSales(list);
 
     const customerIds = Array.from(
       new Set(list.map((sale) => sale.customer_id).filter(Boolean))
     ) as string[];
 
     if (customerIds.length > 0) {
       const { data: customerData } = await supabase
         .from("customers")
         .select("id, full_name")
         .in("id", customerIds);
       const map: Record<string, string> = {};
       for (const row of (customerData ?? []) as CustomerRow[]) {
         map[row.id] = row.full_name;
       }
       setCustomers(map);
     } else {
       setCustomers({});
     }
 
     setLoading(false);
   }
 
   const rows = useMemo(
     () =>
       sales.map((sale) => {
         const status =
           sale.paid_amount >= sale.total_amount
             ? "Pagada"
             : sale.paid_amount > 0
               ? "Parcial"
               : sale.is_fiado
                 ? "Fiada"
                 : "Pendiente";
         return {
           ...sale,
           status,
           paymentMethod: extractPaymentMethod(sale.notes),
           customerName: sale.customer_id
             ? customers[sale.customer_id] ?? "Cliente"
             : "Sin cliente"
         };
       }),
     [customers, sales]
   );
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Ventas</h1>
             <p className="mt-1 text-sm text-slate-500">
               Historial de ventas y estado de cobro.
             </p>
           </div>
         </header>
 
         <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
           {loading && (
             <p className="text-sm text-slate-500">Cargando ventas...</p>
           )}
           {!loading && rows.length === 0 && (
             <p className="text-sm text-slate-500">
               No hay ventas registradas.
             </p>
           )}
           {!loading && rows.length > 0 && (
             <div className="overflow-x-auto">
               <table className="w-full border-collapse text-sm">
                 <thead className="text-left text-slate-500">
                   <tr className="border-b border-slate-200">
                     <th className="py-2 font-medium">Fecha</th>
                     <th className="py-2 font-medium">Total</th>
                     <th className="py-2 font-medium">Método</th>
                     <th className="py-2 font-medium">Cliente</th>
                     <th className="py-2 font-medium">Estado</th>
                     <th className="py-2"></th>
                   </tr>
                 </thead>
                 <tbody>
                   {rows.map((sale) => (
                     <tr key={sale.id} className="border-b border-slate-100">
                       <td className="py-3 text-slate-600">
                         {sale.sale_date
                           ? new Date(sale.sale_date).toLocaleString()
                           : "N/D"}
                       </td>
                       <td className="py-3 font-semibold">
                         {formatARS(sale.total_amount)}
                       </td>
                       <td className="py-3 text-slate-600">
                         {sale.paymentMethod}
                       </td>
                       <td className="py-3 text-slate-600">
                         {sale.customerName}
                       </td>
                       <td className="py-3">
                         <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                           {sale.status}
                         </span>
                       </td>
                       <td className="py-3 text-right">
                         <Link
                           href={`/sales/${sale.id}`}
                           className="text-sm font-semibold text-slate-700 hover:text-slate-900"
                         >
                           Ver detalle
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
