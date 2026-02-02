 "use client";
 
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addDebt, payAccount, reversePayment } from "../../../lib/pos";
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
  const [debtAmount, setDebtAmount] = useState<string>("");
  const [debtNote, setDebtNote] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isPendingDebt, setPendingDebt] = useState(false);
  const [isPendingReverse, setPendingReverse] = useState<string | null>(null);
 
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
    balance > 0 ? "text-rose-600" : balance <= 0 ? "text-teal-600" : "text-slate-700";

  const MOVEMENTS_PAGE_SIZE = 10;
  const [debtPageIndex, setDebtPageIndex] = useState(0);
  const [paymentPageIndex, setPaymentPageIndex] = useState(0);

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

  const debtTotalPages = Math.max(1, Math.ceil(debtMovements.length / MOVEMENTS_PAGE_SIZE));
  const paginatedDebtMovements = useMemo(
    () =>
      debtMovements.slice(
        debtPageIndex * MOVEMENTS_PAGE_SIZE,
        debtPageIndex * MOVEMENTS_PAGE_SIZE + MOVEMENTS_PAGE_SIZE
      ),
    [debtMovements, debtPageIndex]
  );

  const paymentTotalPages = Math.max(1, Math.ceil(paymentAndCreditMovements.length / MOVEMENTS_PAGE_SIZE));
  const paginatedPaymentMovements = useMemo(
    () =>
      paymentAndCreditMovements.slice(
        paymentPageIndex * MOVEMENTS_PAGE_SIZE,
        paymentPageIndex * MOVEMENTS_PAGE_SIZE + MOVEMENTS_PAGE_SIZE
      ),
    [paymentAndCreditMovements, paymentPageIndex]
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

  async function handleReversePayment(accountMovementId: string) {
    setMessage(null);
    setPendingReverse(accountMovementId);
    const result = await reversePayment({ accountMovementId });
    setPendingReverse(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Pago anulado. La deuda se restableció y el movimiento de caja se revirtió.");
    void loadAccount(customerId!);
  }

  function handleAddDebt() {
    setMessage(null);
    const parsed = Number(debtAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage("El monto de la deuda debe ser mayor a cero.");
      return;
    }
    setPendingDebt(true);
    addDebt({ customerId: customerId!, amount: parsed, note: debtNote.trim() || undefined })
      .then((result) => {
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        setMessage("Deuda registrada.");
        setDebtAmount("");
        setDebtNote("");
        void loadAccount(customerId!);
      })
      .finally(() => setPendingDebt(false));
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
     <main className="min-h-screen bg-slate-100/80 text-slate-900">
       <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
         <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
           <div>
             <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
               {customer?.full_name ?? "Ficha de cliente"}
             </h1>
             <p className="mt-0.5 text-sm text-slate-500">
               {customer?.phone ?? "Cliente sin teléfono"}
             </p>
           </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="#payment-section"
              className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
            >
              Registrar pago
            </a>
            <Link
              href="/accounts"
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Volver al listado
            </Link>
          </div>
         </header>

         <section className="mb-6 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
           <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
             <h2 className="text-base font-semibold text-slate-900">Datos del cliente</h2>
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
 
           <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-4 shadow-sm sm:p-5">
             <h2 className="text-base font-semibold text-slate-900">Saldo actual</h2>
             <div className="mt-4 rounded-xl bg-white/80 px-4 py-5">
               <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo</div>
               <div className={`mt-2 text-3xl font-bold tabular-nums ${balanceTone}`}>
                 {balance.toFixed(2)}
               </div>
             </div>
           </div>
         </section>

         <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
           <h2 className="text-base font-semibold text-slate-900">Movimientos de cuenta</h2>

           <div className="mt-4">
             <h3 className="text-base font-medium text-slate-700">
               Deudas pendientes de pago
             </h3>
             {debtMovements.length === 0 ? (
               <p className="mt-2 text-sm text-slate-500">
                 No hay deudas pendientes.
               </p>
             ) : (
               <>
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
                       {paginatedDebtMovements.map((move) => (
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
                               type="button"
                               onClick={() => handlePayDebt(move.amount ?? 0)}
                               className="text-sm font-semibold text-teal-700 hover:text-teal-800"
                             >
                               Pagar
                             </button>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
                 {debtTotalPages > 1 && (
                   <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                     <span className="text-xs text-slate-500">
                       {debtMovements.length} deuda{debtMovements.length !== 1 ? "s" : ""} · Página {debtPageIndex + 1} de {debtTotalPages}
                     </span>
                     <div className="flex gap-1">
                       <button
                         type="button"
                         onClick={() => setDebtPageIndex((p) => Math.max(0, p - 1))}
                         disabled={debtPageIndex === 0}
                         className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                       >
                         Anterior
                       </button>
                       <button
                         type="button"
                         onClick={() => setDebtPageIndex((p) => Math.min(debtTotalPages - 1, p + 1))}
                         disabled={debtPageIndex >= debtTotalPages - 1}
                         className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                       >
                         Siguiente
                       </button>
                     </div>
                   </div>
                 )}
               </>
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
               <>
                 <div className="mt-2 overflow-x-auto">
                   <table className="w-full border-collapse text-sm">
                     <thead className="text-left text-slate-500">
                       <tr className="border-b border-slate-200">
                         <th className="py-2 font-medium">Fecha</th>
                         <th className="py-2 font-medium">Tipo</th>
                         <th className="py-2 font-medium">Referencia</th>
                         <th className="py-2 text-right font-medium">Monto</th>
                         <th className="w-20 py-2 text-right font-medium">Acción</th>
                       </tr>
                     </thead>
                     <tbody>
                       {paginatedPaymentMovements.map((move) => (
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
                           <td className="py-3 text-right font-semibold tabular-nums text-teal-700">
                             {Math.abs(Number(move.amount ?? 0)).toFixed(2)}
                           </td>
                           <td className="py-3 text-right">
                             {move.movement_type === "PAYMENT" && (
                               <button
                                 type="button"
                                 onClick={() => handleReversePayment(move.id)}
                                 disabled={isPendingReverse === move.id}
                                 className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                               >
                                 {isPendingReverse === move.id ? "Anulando…" : "Anular"}
                               </button>
                             )}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
                 {paymentTotalPages > 1 && (
                   <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                     <span className="text-xs text-slate-500">
                       {paymentAndCreditMovements.length} movimiento{paymentAndCreditMovements.length !== 1 ? "s" : ""} · Página {paymentPageIndex + 1} de {paymentTotalPages}
                     </span>
                     <div className="flex gap-1">
                       <button
                         type="button"
                         onClick={() => setPaymentPageIndex((p) => Math.max(0, p - 1))}
                         disabled={paymentPageIndex === 0}
                         className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                       >
                         Anterior
                       </button>
                       <button
                         type="button"
                         onClick={() => setPaymentPageIndex((p) => Math.min(paymentTotalPages - 1, p + 1))}
                         disabled={paymentPageIndex >= paymentTotalPages - 1}
                         className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                       >
                         Siguiente
                       </button>
                     </div>
                   </div>
                 )}
               </>
             )}
           </div>
           {message && (
             <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
               message.includes("registrada") || message.includes("restableció")
                 ? "border-teal-200 bg-teal-50 text-teal-800"
                 : "border-rose-200 bg-rose-50 text-rose-700"
             }`}>
               {message}
             </p>
           )}
         </section>

        <section
          id="payment-section"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-900">Registrar pago</h2>
          <p className="mt-0.5 text-sm text-slate-500">
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
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Ej: 1500"
              />
            </label>
            <button
              type="button"
              onClick={handleRegisterPayment}
              disabled={isPending || loading}
              className="h-11 rounded-lg bg-teal-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPending ? "Procesando…" : "Confirmar pago"}
            </button>
          </div>
          {message && (
            <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              message.includes("registrada") || message.includes("restableció")
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}>
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

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">Agregar deuda</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Registrar una deuda manual (sin venta). Útil para cargar deudas que ya tenés en papel.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700 sm:max-w-xs">
              Monto
              <input
                type="number"
                min={0}
                step="0.01"
                value={debtAmount}
                onChange={(e) => setDebtAmount(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Ej: 5000"
              />
            </label>
            <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700 sm:max-w-xs">
              Nota (opcional)
              <input
                type="text"
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Ej: Deuda anterior"
              />
            </label>
            <button
              type="button"
              onClick={handleAddDebt}
              disabled={isPendingDebt || !debtAmount.trim()}
              className="h-11 shrink-0 rounded-lg border border-rose-300 bg-white px-6 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPendingDebt ? "Registrando…" : "Registrar deuda"}
            </button>
          </div>
        </section>
       </div>
     </main>
   );
 }
