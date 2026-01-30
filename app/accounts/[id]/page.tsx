 "use client";
 
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { payAccount } from "../../../lib/pos";
import { getSupabaseClient } from "../../../lib/supabaseClient";
 
 type CustomerRow = {
   id: string;
   full_name: string;
   phone: string | null;
  email?: string | null;
 };
 
 type AccountRow = {
   id: string;
   customer_id: string;
   status: "PROBANDO" | "DEUDA" | "CANCELADO";
 };
 
 type BalanceRow = {
   customer_id: string;
   balance: number;
 };
 
 type MovementRow = {
   id: string;
   movement_type?: string | null;
   amount?: number | null;
   reference_type?: string | null;
   note?: string | null;
   created_at?: string | null;
 };
 
 export default function AccountDetailPage() {
   const params = useParams<{ id: string }>();
   const customerId = Array.isArray(params.id) ? params.id[0] : params.id;
   const supabase = getSupabaseClient();
   const [customer, setCustomer] = useState<CustomerRow | null>(null);
   const [account, setAccount] = useState<AccountRow | null>(null);
   const [balance, setBalance] = useState<number>(0);
   const [movements, setMovements] = useState<MovementRow[]>([]);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
 
   useEffect(() => {
     if (!customerId) return;
     void loadAccount(customerId);
   }, [customerId]);
 
   async function loadAccount(id: string) {
     setMessage(null);
     setLoading(true);
 
    const { data: customerData, error: customerError } = await supabase
       .from("customers")
      .select("id, full_name, phone, email")
       .eq("id", id)
       .maybeSingle();
 
     if (customerError || !customerData) {
       setMessage("No se pudo cargar el cliente");
       setLoading(false);
       return;
     }
 
     setCustomer(customerData as CustomerRow);
 
     const { data: accountData } = await supabase
       .from("current_accounts")
       .select("id, customer_id, status")
       .eq("customer_id", id)
       .maybeSingle();
 
     const accountRow = (accountData as AccountRow | null) ?? null;
     setAccount(accountRow);
 
     const { data: balanceData } = await supabase
       .from("v_account_balance")
       .select("customer_id, balance")
       .eq("customer_id", id)
       .maybeSingle();
 
     setBalance((balanceData as BalanceRow | null)?.balance ?? 0);
 
     if (!accountRow?.id) {
       setMovements([]);
       setLoading(false);
       return;
     }
 
    const { data: movementData } = await supabase
       .from("account_movements")
       .select("*")
       .eq("account_id", accountRow.id)
       .order("created_at", { ascending: false });
 
     setMovements((movementData ?? []) as MovementRow[]);
     setLoading(false);
   }
 
  const balanceTone =
    balance > 0 ? "text-rose-600" : balance <= 0 ? "text-emerald-600" : "text-slate-700";

  const debtMovements = useMemo(
    () =>
      movements.filter(
        (move) => move.movement_type === "DEBT" && (move.amount ?? 0) > 0
      ),
    [movements]
  );

  const paymentAndCreditMovements = useMemo(
    () =>
      movements.filter(
        (move) =>
          (move.movement_type === "PAYMENT" ||
            move.movement_type === "CREDIT" ||
            move.movement_type === "CONSUME_CREDIT") &&
          (move.amount ?? 0) !== 0
      ),
    [movements]
  );

  function handlePayDebt(amount: number) {
    setPaymentAmount(String(amount));
    const section = document.getElementById("payment-section");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleRegisterPayment() {
    setMessage(null);
    const parsed = Number(paymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("Ingrese un monto válido.");
      return;
    }
    if (parsed > balance) {
      setMessage("El monto no puede superar el saldo.");
      return;
    }

    startTransition(() => {
      void registerPayment(parsed);
    });
  }

  async function registerPayment(amount: number) {
    const result = await payAccount({
      customerId,
      amount,
      paymentMethod: "CASH"
    });

    if (!result.ok) {
      setMessage(`Error: ${result.error.message}`);
      return;
    }

    setPaymentAmount("");
    void loadAccount(customerId);
    setMessage("Pago registrado correctamente.");
  }
 
   return (
     <main className="min-h-screen bg-slate-50 text-slate-900">
       <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
         <header className="flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-3xl font-semibold">
               {customer?.full_name ?? "Ficha de cliente"}
             </h1>
             <p className="mt-1 text-sm text-slate-500">
               {customer?.phone ?? "Cliente sin teléfono"}
             </p>
           </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="#payment-section"
              className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Registrar pago
            </a>
            <Link
              href="/accounts"
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Volver al listado
            </Link>
          </div>
         </header>
 
         <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
           <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
             <h2 className="text-lg font-semibold">Datos del cliente</h2>
             {loading && (
               <p className="mt-4 text-sm text-slate-500">Cargando...</p>
             )}
             {!loading && customer && (
               <div className="mt-4 space-y-2 text-sm text-slate-700">
                 <div>
                   <span className="text-xs uppercase text-slate-500">Nombre</span>
                   <div className="text-base font-semibold">{customer.full_name}</div>
                 </div>
               <div>
                 <span className="text-xs uppercase text-slate-500">Teléfono</span>
                 <div className="text-base">{customer.phone ?? "Sin dato"}</div>
               </div>
               <div>
                 <span className="text-xs uppercase text-slate-500">Email</span>
                 <div className="text-base">{customer.email ?? "Sin dato"}</div>
               </div>
                 <div>
                   <span className="text-xs uppercase text-slate-500">Estado</span>
                   <div className="text-base font-semibold">
                     {account?.status ?? "SIN CUENTA"}
                   </div>
                 </div>
               </div>
             )}
           </div>
 
           <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
             <h2 className="text-lg font-semibold">Saldo actual</h2>
             <div className="mt-4 rounded-lg bg-slate-50 px-4 py-5">
               <div className="text-xs uppercase text-slate-500">Saldo</div>
               <div className={`mt-2 text-3xl font-semibold ${balanceTone}`}>
                 {balance.toFixed(2)}
               </div>
             </div>
           </div>
         </section>
 
         <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
           <h2 className="text-lg font-semibold">Movimientos de cuenta</h2>

           <div className="mt-4">
             <h3 className="text-base font-medium text-slate-700">
               Deudas pendientes de pago
             </h3>
             {debtMovements.length === 0 ? (
               <p className="mt-2 text-sm text-slate-500">
                 No hay deudas pendientes.
               </p>
             ) : (
               <div className="mt-2 overflow-x-auto">
                 <table className="w-full border-collapse text-sm">
                   <thead className="text-left text-slate-500">
                     <tr className="border-b border-slate-200">
                       <th className="py-2 font-medium">Fecha</th>
                       <th className="py-2 font-medium">Referencia</th>
                       <th className="py-2 text-right font-medium">Monto</th>
                       <th className="py-2"></th>
                     </tr>
                   </thead>
                   <tbody>
                     {debtMovements.map((move) => (
                       <tr key={move.id} className="border-b border-slate-100">
                         <td className="py-3 text-slate-600">
                           {move.created_at
                             ? new Date(move.created_at).toLocaleString()
                             : "N/D"}
                         </td>
                         <td className="py-3 text-slate-500">
                           {move.reference_type ?? "N/D"}
                         </td>
                         <td className="py-3 text-right font-semibold text-rose-700">
                           +{(move.amount ?? 0).toFixed(2)}
                         </td>
                         <td className="py-3 text-right">
                           <button
                             onClick={() => handlePayDebt(move.amount ?? 0)}
                             className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                           >
                             Pagar
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
           </div>

           <div className="mt-8">
             <h3 className="text-base font-medium text-slate-700">
               Pagos y saldos entregados
             </h3>
             {paymentAndCreditMovements.length === 0 ? (
               <p className="mt-2 text-sm text-slate-500">
                 No hay pagos ni créditos registrados.
               </p>
             ) : (
               <div className="mt-2 overflow-x-auto">
                 <table className="w-full border-collapse text-sm">
                   <thead className="text-left text-slate-500">
                     <tr className="border-b border-slate-200">
                       <th className="py-2 font-medium">Fecha</th>
                       <th className="py-2 font-medium">Tipo</th>
                       <th className="py-2 font-medium">Referencia</th>
                       <th className="py-2 text-right font-medium">Monto</th>
                     </tr>
                   </thead>
                   <tbody>
                     {paymentAndCreditMovements.map((move) => (
                       <tr key={move.id} className="border-b border-slate-100">
                         <td className="py-3 text-slate-600">
                           {move.created_at
                             ? new Date(move.created_at).toLocaleString()
                             : "N/D"}
                         </td>
                         <td className="py-3 font-medium">
                           {move.movement_type === "PAYMENT"
                             ? "Pago"
                             : move.movement_type === "CREDIT"
                               ? "Crédito a favor"
                               : "Uso de crédito"}
                         </td>
                         <td className="py-3 text-slate-500">
                           {move.reference_type ?? "N/D"}
                         </td>
                         <td className="py-3 text-right font-semibold text-emerald-700">
                           {(move.amount ?? 0).toFixed(2)}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
           </div>
           {message && (
             <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
               {message}
             </p>
           )}
         </section>

        <section
          id="payment-section"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold">Registrar pago</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ingrese el monto a registrar contra la deuda actual.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700 sm:max-w-xs">
              Monto a pagar
              <input
                type="number"
                min={0}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="h-11 rounded-lg border border-slate-300 px-3 text-base font-normal focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Ej: 1500"
              />
            </label>
            <button
              onClick={handleRegisterPayment}
              disabled={isPending || loading}
              className="h-11 rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPending ? "Procesando..." : "Confirmar pago"}
            </button>
          </div>
          {message && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {message}
            </p>
          )}
          {debtMovements.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Tip: podés pagar una deuda puntual desde la tabla y se completa el
              monto automáticamente.
            </p>
          )}
        </section>
       </div>
     </main>
   );
 }
