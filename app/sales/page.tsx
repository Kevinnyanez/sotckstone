"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

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

type CustomerRow = {
  id: string;
  full_name: string;
};

type PeriodFilter = "day" | "week" | "month" | "all";

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

function getRangeForPeriod(
  period: PeriodFilter,
  dateDay: string,
  dateWeek: string,
  dateMonth: string
): { start: string; end: string } | null {
  if (period === "all") return null;
  const toLocalStart = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  const toLocalEnd = (d: Date) => {
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };
  if (period === "day" && dateDay) {
    const [y, m, d] = dateDay.split("-").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (period === "week" && dateWeek) {
    const [y, m, d] = dateWeek.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0);
    const end = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (period === "month" && dateMonth) {
    const [y, m] = dateMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}

function getDefaultDates() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  const wY = monday.getFullYear();
  const wM = String(monday.getMonth() + 1).padStart(2, "0");
  const wD = String(monday.getDate()).padStart(2, "0");
  const week = `${wY}-${wM}-${wD}`;
  const month = `${y}-${m}`;
  return { day, week, month };
}

export default function SalesPage() {
  const supabase = getSupabaseClient();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const defaults = useMemo(getDefaultDates, []);
  const [dateDay, setDateDay] = useState(defaults.day);
  const [dateWeek, setDateWeek] = useState(defaults.week);
  const [dateMonth, setDateMonth] = useState(defaults.month);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const range = getRangeForPeriod(period, dateDay, dateWeek, dateMonth);
    let query = supabase
      .from("sales")
      .select("id, sale_date, total_amount, paid_amount, is_fiado, customer_id, notes, cancelled_at")
      .order("sale_date", { ascending: false });
    if (range) {
      query = query.gte("sale_date", range.start).lte("sale_date", range.end);
    }
    const { data, error } = await query;

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
  }, [period, dateDay, dateWeek, dateMonth, supabase]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);
 
   const PAGE_SIZE = 20;
  const [pageIndex, setPageIndex] = useState(0);

  const rows = useMemo(
     () =>
       sales.map((sale) => {
         const isCancelled = Boolean(sale.cancelled_at);
         const status = isCancelled
           ? "Anulada"
           : sale.paid_amount >= sale.total_amount
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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () => rows.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE),
    [rows, pageIndex]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [period, dateDay, dateWeek, dateMonth]);

  const periodLabel =
    period === "day"
      ? `Día ${dateDay}`
      : period === "week"
        ? `Semana del ${dateWeek}`
        : period === "month"
          ? `Mes ${dateMonth}`
          : "Todas";

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Ventas
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Historial de ventas para consulta y control de cobro.
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-900">Filtro por período</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Consultá ventas por día, semana o mes.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-wrap gap-2">
              {(["all", "day", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    period === p
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {p === "all" ? "Todas" : p === "day" ? "Día" : p === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            {period === "day" && (
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Fecha
                <input
                  type="date"
                  value={dateDay}
                  onChange={(e) => setDateDay(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </label>
            )}
            {period === "week" && (
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Algún día de la semana
                <input
                  type="date"
                  value={dateWeek}
                  onChange={(e) => setDateWeek(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </label>
            )}
            {period === "month" && (
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Mes
                <input
                  type="month"
                  value={dateMonth}
                  onChange={(e) => setDateMonth(e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </label>
            )}
            <span className="text-sm text-slate-500">Mostrando: {periodLabel}</span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold text-slate-900">Registro de ventas</h2>
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
              Cargando ventas…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              {period === "all"
                ? "No hay ventas registradas."
                : `No hay ventas en el período seleccionado (${periodLabel}).`}
            </div>
          )}
          {!loading && rows.length > 0 && (
            <>
              <p className="border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600 sm:px-5">
                {rows.length} venta{rows.length !== 1 ? "s" : ""} · Total:{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatARS(rows.reduce((acc, s) => acc + s.total_amount, 0))}
                </span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">
                        Total
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Método
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">
                        Estado
                      </th>
                      <th className="w-24 px-4 py-3 text-right font-medium text-slate-600">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((sale) => (
                      <tr
                        key={sale.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3 text-slate-600">
                          {sale.sale_date
                            ? new Date(sale.sale_date).toLocaleString("es-AR")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                          {formatARS(sale.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {sale.paymentMethod}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {sale.customerName}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${
                            sale.status === "Anulada" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}>
                            {sale.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/sales/${sale.id}`}
                            className="font-medium text-teal-700 hover:text-teal-800"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 sm:px-5">
                  <span className="text-xs text-slate-500">
                    {rows.length} venta{rows.length !== 1 ? "s" : ""}
                    {totalPages > 1 && ` · Página ${pageIndex + 1} de ${totalPages}`}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                      disabled={pageIndex === 0}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={pageIndex >= totalPages - 1}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {message && (
            <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {message}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
