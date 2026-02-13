"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { payAccount } from "../../../../lib/pos";
import { getSupabaseClient } from "../../../../lib/supabaseClient";

const PAYMENT_METHODS = [
  { label: "Efectivo", value: "CASH" as const },
  { label: "Transferencia", value: "TRANSFER" as const },
  { label: "Débito", value: "CARD" as const },
  { label: "Crédito", value: "OTHER" as const }
];

type CustomerRow = {
  id: string;
  full_name: string;
};

type BalanceRow = {
  customer_id: string;
  balance: number;
};

export default function AccountPayPage() {
  const params = useParams<{ id: string }>();
  const customerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = getSupabaseClient();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER" | "CARD" | "OTHER">("CASH");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
 
   useEffect(() => {
     if (!customerId) return;
     void loadCustomer(customerId);
   }, [customerId]);
 
   async function loadCustomer(id: string) {
     setLoading(true);
     const { data, error } = await supabase
       .from("customers")
       .select("id, full_name")
       .eq("id", id)
       .maybeSingle();
     if (error || !data) {
       setMessage("No se pudo cargar el cliente");
       setLoading(false);
       return;
     }
     setCustomer(data as CustomerRow);
 
     const { data: balanceData } = await supabase
       .from("v_account_balance")
       .select("customer_id, balance")
       .eq("customer_id", id)
       .maybeSingle();
     setBalance((balanceData as BalanceRow | null)?.balance ?? 0);
     setLoading(false);
   }
 
   const parsedAmount = Number(amount);
   const parsedDiscount = Number(discountPercent);
   const hasValidDiscount = Number.isFinite(parsedDiscount) && parsedDiscount > 0 && parsedDiscount < 100;
   const cashToCollect = hasValidDiscount && Number.isFinite(parsedAmount) && parsedAmount > 0
     ? Number((parsedAmount * (1 - parsedDiscount / 100)).toFixed(2))
     : null;

   function handleSubmit() {
     setMessage(null);
     if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
       setMessage("Ingrese un monto válido.");
       return;
     }
     if (parsedAmount > balance) {
       setMessage("El monto no puede superar el saldo.");
       return;
     }
     if (discountPercent.trim() !== "" && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount >= 100)) {
       setMessage("El descuento debe ser un % entre 0 y 99.");
       return;
     }
 
    startTransition(async () => {
      const result = await payAccount({
        customerId,
        amount: parsedAmount,
        paymentMethod,
        discountPercent: hasValidDiscount ? parsedDiscount : undefined
      });
 
       if (!result.ok) {
         setMessage(`Error: ${result.error.message}`);
         return;
       }
 
       router.push(`/accounts/${customerId}`);
     });
   }
 
   return (
     <main className="min-h-screen bg-slate-100/80 text-slate-900">
       <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
         <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Registrar pago</h1>
             <p className="mt-0.5 text-sm text-slate-500">
               {customer?.full_name ?? "Cliente"}
             </p>
           </div>
           <Link
             href={`/accounts/${customerId}`}
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
                 <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo actual</div>
                 <div className="mt-2 text-2xl font-bold tabular-nums text-teal-800">
                   {balance.toFixed(2)}
                 </div>
               </div>
               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Forma de pago
                 <select
                   value={paymentMethod}
                   onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "TRANSFER" | "CARD" | "OTHER")}
                   className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                 >
                   {PAYMENT_METHODS.map((m) => (
                     <option key={m.value} value={m.value}>{m.label}</option>
                   ))}
                 </select>
               </label>
               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Monto a pagar (se descuenta de la deuda)
                 <input
                   type="number"
                   min={0}
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                   placeholder="Ej: 1500"
                 />
               </label>
               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Descuento % (opcional, ej. 10 si paga antes de 30 días)
                 <input
                   type="number"
                   min={0}
                   max={99}
                   step={0.5}
                   value={discountPercent}
                   onChange={(e) => setDiscountPercent(e.target.value)}
                   className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                   placeholder="0"
                 />
               </label>
               {cashToCollect != null && (
                 <p className="text-sm text-slate-600">
                   Monto que paga el cliente (ingresa a caja): <strong className="tabular-nums">{cashToCollect.toFixed(2)}</strong>
                 </p>
               )}
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
               {isPending ? "Registrando…" : "Confirmar pago"}
             </button>
             <Link
               href={`/accounts/${customerId}`}
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
