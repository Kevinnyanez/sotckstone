 "use client";
 
 import Link from "next/link";
 import { useParams, useRouter } from "next/navigation";
 import { useEffect, useState, useTransition } from "react";
 import { payAccount } from "../../../../lib/pos";
 import { getSupabaseClient } from "../../../../lib/supabaseClient";
 
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
 
   function handleSubmit() {
     setMessage(null);
     const parsed = Number(amount);
     if (!Number.isFinite(parsed) || parsed <= 0) {
       setMessage("Ingrese un monto válido.");
       return;
     }
     if (parsed > balance) {
       setMessage("El monto no puede superar el saldo.");
       return;
     }
 
     startTransition(async () => {
       const result = await payAccount({
         customerId,
         amount: parsed,
         paymentMethod: "CASH"
       });
 
       if (!result.ok) {
         setMessage(`Error: ${result.error.message}`);
         return;
       }
 
       router.push(`/accounts/${customerId}`);
     });
   }
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">Registrar pago</h1>
             <p className="mt-1 text-sm text-slate-500">
               {customer?.full_name ?? "Cliente"}
             </p>
           </div>
           <Link
             href={`/accounts/${customerId}`}
             className="text-sm font-semibold text-slate-600 hover:text-slate-900"
           >
             Volver a la ficha
           </Link>
         </header>
 
         <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
           {loading && (
             <p className="text-sm text-slate-500">Cargando datos...</p>
           )}
           {!loading && (
             <div className="space-y-4">
               <div className="rounded-lg bg-slate-50 px-4 py-4">
                 <div className="text-xs uppercase text-slate-500">Saldo actual</div>
                 <div className="mt-2 text-2xl font-semibold">
                   {balance.toFixed(2)}
                 </div>
               </div>
               <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                 Monto a registrar
                 <input
                   type="number"
                   min={0}
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                   placeholder="Ej: 1500"
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
               onClick={handleSubmit}
               disabled={isPending || loading}
               className="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
             >
               {isPending ? "Registrando..." : "Confirmar pago"}
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
