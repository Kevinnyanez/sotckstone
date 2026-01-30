"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

type CashMovementRow = {
  id: string;
  movement_type: string | null;
  direction: string | null;
  amount: number | null;
  reference_type: string | null;
  payment_method: string | null;
  created_at: string | null;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Débito / Crédito",
  OTHER: "Otro"
};

function formatARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2
  }).format(value);
}

function getOriginLabel(row: CashMovementRow): string {
  if (row.movement_type === "SALE") return "Ventas";
  if (row.movement_type === "ACCOUNT_PAYMENT") return "Pagos de deudas";
  if (row.movement_type === "ADJUSTMENT" && row.reference_type === "EXCHANGE") return "Diferencia cambios";
  return row.movement_type ?? "Otro";
}

export default function ReportsPage() {
  const supabase = getSupabaseClient();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [movements, setMovements] = useState<CashMovementRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    const { data, error } = await supabase
      .from("cash_movements")
      .select("id, movement_type, direction, amount, reference_type, payment_method, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true });

    if (error) {
      setMovements([]);
      setLoading(false);
      return;
    }
    setMovements((data ?? []) as CashMovementRow[]);
    setLoading(false);
  }, [date, supabase]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const { totalCashIn, totalOthersIn, totalCashOut, totalOthersOut, byOrigin } = (() => {
    let cashIn = 0;
    let othersIn = 0;
    let cashOut = 0;
    let othersOut = 0;
    const originMap: Record<string, { cash: number; others: number }> = {};

    for (const row of movements) {
      const amount = Number(row.amount ?? 0);
      const method = row.payment_method ?? "CASH";
      const isCash = method === "CASH";
      const label = getOriginLabel(row);

      if (row.direction === "IN") {
        if (isCash) {
          cashIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].cash += amount;
        } else {
          othersIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].others += amount;
        }
      } else {
        if (isCash) cashOut += amount;
        else othersOut += amount;
      }
    }

    return {
      totalCashIn: cashIn,
      totalOthersIn: othersIn,
      totalCashOut: cashOut,
      totalOthersOut: othersOut,
      byOrigin: Object.entries(originMap).map(([label, v]) => ({ label, ...v }))
    };
  })();

  const totalIn = totalCashIn + totalOthersIn;
  const totalOut = totalCashOut + totalOthersOut;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <header>
          <h1 className="text-3xl font-semibold">Reportes – Caja</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ingresos y egresos por día: efectivo y otros métodos, por origen (ventas, pagos de deudas, diferencia cambios).
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-10 w-full max-w-xs rounded-lg border border-slate-300 px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </section>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Resumen del día</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Ingresos – Efectivo</div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-700">
                    {formatARS(totalCashIn)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Ingresos – Otros métodos</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-800">
                    {formatARS(totalOthersIn)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Total ingresos</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatARS(totalIn)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Egresos (efectivo + otros)</div>
                  <div className="mt-1 text-2xl font-semibold text-rose-700">
                    {formatARS(totalOut)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Desglose por origen (ingresos)</h2>
              {byOrigin.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Sin ingresos este día.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 font-medium">Origen</th>
                        <th className="py-2 text-right font-medium">Efectivo</th>
                        <th className="py-2 text-right font-medium">Otros</th>
                        <th className="py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byOrigin.map(({ label, cash, others }) => (
                        <tr key={label} className="border-b border-slate-100">
                          <td className="py-3 font-medium text-slate-800">{label}</td>
                          <td className="py-3 text-right text-emerald-700">{formatARS(cash)}</td>
                          <td className="py-3 text-right text-slate-700">{formatARS(others)}</td>
                          <td className="py-3 text-right font-medium">{formatARS(cash + others)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Movimientos del día</h2>
              {movements.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No hay movimientos este día.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 font-medium">Hora</th>
                        <th className="py-2 font-medium">Origen</th>
                        <th className="py-2 font-medium">Método</th>
                        <th className="py-2 text-right font-medium">Dirección</th>
                        <th className="py-2 text-right font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((row) => {
                        const amount = Number(row.amount ?? 0);
                        const isIn = row.direction === "IN";
                        const method = row.payment_method ?? "—";
                        return (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="py-2 text-slate-600">
                              {row.created_at
                                ? new Date(row.created_at).toLocaleTimeString("es-AR", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })
                                : "—"}
                            </td>
                            <td className="py-2 font-medium text-slate-800">
                              {getOriginLabel(row)}
                            </td>
                            <td className="py-2 text-slate-600">
                              {PAYMENT_METHOD_LABELS[method] ?? method}
                            </td>
                            <td className="py-2 text-right">
                              <span
                                className={
                                  isIn ? "text-emerald-700 font-medium" : "text-rose-700 font-medium"
                                }
                              >
                                {isIn ? "Entrada" : "Salida"}
                              </span>
                            </td>
                            <td
                              className={`py-2 text-right font-medium ${
                                isIn ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {isIn ? "+" : "-"}
                              {formatARS(Math.abs(amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
