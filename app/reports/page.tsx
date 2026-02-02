"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

const MOVEMENTS_PAGE_SIZE = 25;

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

  const [movementsPageIndex, setMovementsPageIndex] = useState(0);
  useEffect(() => {
    setMovementsPageIndex(0);
  }, [date]);

  const {
    efectivoEnCaja,
    ingresosTransferencia,
    ingresosDebitoCredito,
    egresosTotales,
    byOrigin
  } = (() => {
    let cashIn = 0;
    let cashOut = 0;
    let transferIn = 0;
    let cardIn = 0;
    let otherIn = 0;
    let totalOut = 0;
    const originMap: Record<string, { cash: number; others: number }> = {};

    for (const row of movements) {
      const amount = Number(row.amount ?? 0);
      const method = row.payment_method ?? "CASH";
      const label = getOriginLabel(row);

      if (row.direction === "IN") {
        if (method === "CASH") {
          cashIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].cash += amount;
        } else if (method === "TRANSFER") {
          transferIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].others += amount;
        } else if (method === "CARD") {
          cardIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].others += amount;
        } else {
          otherIn += amount;
          if (!originMap[label]) originMap[label] = { cash: 0, others: 0 };
          originMap[label].others += amount;
        }
      } else {
        totalOut += amount;
        if (method === "CASH") cashOut += amount;
      }
    }

    return {
      efectivoEnCaja: cashIn - cashOut,
      ingresosTransferencia: transferIn,
      ingresosDebitoCredito: cardIn + otherIn,
      egresosTotales: totalOut,
      byOrigin: Object.entries(originMap).map(([label, v]) => ({ label, ...v }))
    };
  })();

  const movementsTotalPages = Math.max(
    1,
    Math.ceil(movements.length / MOVEMENTS_PAGE_SIZE)
  );
  const paginatedMovements = useMemo(
    () =>
      movements.slice(
        movementsPageIndex * MOVEMENTS_PAGE_SIZE,
        movementsPageIndex * MOVEMENTS_PAGE_SIZE + MOVEMENTS_PAGE_SIZE
      ),
    [movements, movementsPageIndex]
  );

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Reportes – Caja
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Balance en efectivo en caja, ingresos por transferencia y débito/crédito, y egresos del día.
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label className="block text-sm font-medium text-slate-700">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-2 h-10 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </section>

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-12 text-sm text-slate-500 shadow-sm">
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
            Cargando movimientos…
          </div>
        ) : (
          <>
            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Resumen del día</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Efectivo en caja</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${efectivoEnCaja >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatARS(efectivoEnCaja)}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Neto del día (entradas − salidas en efectivo)</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Ingresos por transferencia</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
                    {formatARS(ingresosTransferencia)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Ingresos por débito / crédito</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
                    {formatARS(ingresosDebitoCredito)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase text-slate-500">Egresos totales del día</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-700">
                    {formatARS(egresosTotales)}
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">Desglose por origen (ingresos)</h2>
              {byOrigin.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">Sin ingresos este día.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-4 py-3 text-left font-medium text-slate-600">Origen</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">Efectivo</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">Otros</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byOrigin.map(({ label, cash, others }) => (
                        <tr key={label} className="border-b border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-800">{label}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatARS(cash)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatARS(others)}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">{formatARS(cash + others)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold text-slate-900">Movimientos del día</h2>
              </div>
              {movements.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  No hay movimientos este día.
                </div>
              ) : (
                <>
                  <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600 sm:px-5">
                    {movements.length} movimiento{movements.length !== 1 ? "s" : ""}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80">
                          <th className="px-4 py-3 text-left font-medium text-slate-600">Hora</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">Origen</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">Método</th>
                          <th className="px-4 py-3 text-right font-medium text-slate-600">Dirección</th>
                          <th className="px-4 py-3 text-right font-medium text-slate-600">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMovements.map((row) => {
                        const amount = Number(row.amount ?? 0);
                        const isIn = row.direction === "IN";
                        const method = row.payment_method ?? "—";
                        return (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-slate-600 tabular-nums">
                              {row.created_at
                                ? new Date(row.created_at).toLocaleTimeString("es-AR", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800">
                              {getOriginLabel(row)}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {PAYMENT_METHOD_LABELS[method] ?? method}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={
                                  isIn ? "font-medium text-emerald-700" : "font-medium text-rose-700"
                                }
                              >
                                {isIn ? "Entrada" : "Salida"}
                              </span>
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-medium tabular-nums ${
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
                  {movementsTotalPages > 1 && (
                    <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 sm:px-5">
                      <span className="text-xs text-slate-500">
                        {movements.length} movimiento{movements.length !== 1 ? "s" : ""}
                        {movementsTotalPages > 1 && ` · Página ${movementsPageIndex + 1} de ${movementsTotalPages}`}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setMovementsPageIndex((p) => Math.max(0, p - 1))
                          }
                          disabled={movementsPageIndex === 0}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMovementsPageIndex((p) =>
                              Math.min(movementsTotalPages - 1, p + 1)
                            )
                          }
                          disabled={movementsPageIndex >= movementsTotalPages - 1}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
