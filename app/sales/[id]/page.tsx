 "use client";
 
 import Link from "next/link";
 import { useParams } from "next/navigation";
 import { useEffect, useState } from "react";
 import { getSupabaseClient } from "../../../lib/supabaseClient";
 
 type SaleRow = {
   id: string;
   sale_date: string | null;
   total_amount: number;
   paid_amount: number;
   is_fiado: boolean;
   customer_id: string | null;
   notes?: string | null;
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
 
   useEffect(() => {
     if (!saleId) return;
     void loadSale(saleId);
   }, [saleId]);
 
   async function loadSale(id: string) {
     setLoading(true);
     setMessage(null);
 
     const { data: saleData, error: saleError } = await supabase
       .from("sales")
       .select("id, sale_date, total_amount, paid_amount, is_fiado, customer_id, notes")
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
 
   const status = sale
     ? sale.paid_amount >= sale.total_amount
       ? "Pagada"
       : sale.paid_amount > 0
         ? "Parcial"
         : sale.is_fiado
           ? "Fiada"
           : "Pendiente"
     : "N/D";
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Detalle de venta</h1>
             <p className="mt-1 text-sm text-slate-500">
               {sale?.sale_date
                 ? new Date(sale.sale_date).toLocaleString()
                 : "Fecha N/D"}
             </p>
           </div>
           <Link
             href="/sales"
             className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
           >
             Volver a ventas
           </Link>
         </header>
 
         <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
           <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
             <h2 className="text-lg font-semibold">Resumen</h2>
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
                   <span className="font-semibold">{status}</span>
                 </div>
                 <div className="mt-3 rounded-lg bg-slate-50 px-4 py-4">
                   <div className="text-xs uppercase text-slate-500">Total</div>
                   <div className="mt-2 text-3xl font-semibold">
                     {formatARS(sale.total_amount)}
                   </div>
                 </div>
               </div>
             )}
           </div>
 
           <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
             <h2 className="text-lg font-semibold">Pago</h2>
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
 
         <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
           <h2 className="text-lg font-semibold">Items</h2>
           {items.length === 0 ? (
             <p className="mt-4 text-sm text-slate-500">
               No hay items registrados.
             </p>
           ) : (
             <div className="mt-4 overflow-x-auto">
               <table className="w-full border-collapse text-sm">
                 <thead className="text-left text-slate-500">
                   <tr className="border-b border-slate-200">
                     <th className="py-2 font-medium">Producto</th>
                     <th className="py-2 font-medium">Código</th>
                     <th className="py-2 text-right font-medium">Cant.</th>
                     <th className="py-2 text-right font-medium">Precio</th>
                     <th className="py-2 text-right font-medium">Total</th>
                   </tr>
                 </thead>
                 <tbody>
                   {items.map((item) => {
                     const product = products[item.product_id];
                     return (
                       <tr key={item.id} className="border-b border-slate-100">
                         <td className="py-3 font-medium">
                           {product?.name ?? item.product_id}
                         </td>
                         <td className="py-3 text-slate-500">
                           {product?.barcode ?? "N/D"}
                         </td>
                         <td className="py-3 text-right">{item.quantity}</td>
                         <td className="py-3 text-right">
                           {formatARS(item.unit_price)}
                         </td>
                         <td className="py-3 text-right font-semibold">
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
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
         </section>
       </div>
     </main>
   );
 }
