import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../lib/supabaseServer";

type PeriodFilter = "day" | "week" | "month" | "all";

type SystemSaleItem = {
  id: string;
  date: string;
  type: "SALE" | "EXCHANGE";
  channel: string | null;
  sale_type?: string | null;
  conditional_status?: string | null;
  is_fiado?: boolean | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  difference_amount?: number | null;
  customer_id?: string | null;
  customer_name?: string | null;
  note?: string | null;
  status?: string;
  cancelled?: boolean;
};

function getDateRange(period: PeriodFilter, date: string) {
  if (period === "all") return null;
  if (!date) return null;

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  if (period === "day") {
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (period === "week") {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const start = new Date(monday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(sunday);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (period === "month") {
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(request.url);
    const period = (url.searchParams.get("period") as PeriodFilter) || "day";
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const range = getDateRange(period, date);

    let salesQuery = supabase
      .from("sales")
      .select(
        "id, sale_date, total_amount, paid_amount, is_fiado, customer_id, notes, channel, sale_type, conditional_status, cancelled_at"
      )
      .order("sale_date", { ascending: false });

    let exchangeQuery = supabase
      .from("exchanges")
      .select("id, exchange_date, customer_id, difference_amount, note")
      .order("exchange_date", { ascending: false });

    if (range) {
      salesQuery = salesQuery.gte("sale_date", range.start).lte("sale_date", range.end);
      exchangeQuery = exchangeQuery.gte("exchange_date", range.start).lte("exchange_date", range.end);
    }

    const [{ data: sales, error: salesError }, { data: exchanges, error: exchangesError }] = await Promise.all([
      salesQuery,
      exchangeQuery
    ]);

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 });
    }
    if (exchangesError) {
      return NextResponse.json({ error: exchangesError.message }, { status: 500 });
    }

    const customerIds = Array.from(
      new Set([
        ...(sales ?? []).map((s: any) => s.customer_id).filter(Boolean),
        ...(exchanges ?? []).map((e: any) => e.customer_id).filter(Boolean)
      ])
    ) as string[];

    const customersMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, full_name")
        .in("id", customerIds);
      for (const row of (customers ?? []) as { id: string; full_name: string }[]) {
        customersMap[row.id] = row.full_name;
      }
    }

    const items: SystemSaleItem[] = [];

    for (const s of (sales ?? []) as any[]) {
      const isCancelled = s.cancelled_at != null;
      const status = isCancelled
        ? "Anulada"
        : s.paid_amount >= s.total_amount
          ? "Pagada"
          : s.paid_amount > 0
            ? "Parcial"
            : s.is_fiado
              ? "Fiada"
              : "Pendiente";

      items.push({
        id: s.id,
        date: s.sale_date ?? "",
        type: "SALE",
        channel: s.channel ?? "LOCAL",
        sale_type: s.sale_type ?? null,
        conditional_status: s.conditional_status ?? null,
        is_fiado: s.is_fiado,
        total_amount: s.total_amount,
        paid_amount: s.paid_amount,
        customer_id: s.customer_id ?? null,
        customer_name: s.customer_id ? customersMap[s.customer_id] ?? "Cliente" : "Sin cliente",
        note: s.notes ?? null,
        status,
        cancelled: isCancelled
      });
    }

    for (const e of (exchanges ?? []) as any[]) {
      items.push({
        id: e.id,
        date: e.exchange_date ?? "",
        type: "EXCHANGE",
        channel: "LOCAL",
        difference_amount: e.difference_amount,
        customer_id: e.customer_id ?? null,
        customer_name: e.customer_id ? customersMap[e.customer_id] ?? "Cliente" : "Sin cliente",
        note: e.note ?? null,
        status: "Cambio"
      });
    }

    items.sort((a, b) => (b.date.localeCompare(a.date))); // recent first

    return NextResponse.json({ items, period, date });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
