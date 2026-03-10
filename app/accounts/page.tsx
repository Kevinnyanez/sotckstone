"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
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

type MovementAgingRow = {
  account_id: string;
  movement_type: string;
  amount: number;
  created_at: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
};

type AccountListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  status: AccountRow["status"] | "SIN CUENTA";
  balance: number;
  /** Fecha de la primera deuda activa (para contar 30 días). */
  oldestDebtAt?: string | null;
  /** Días restantes hasta cumplir 30 desde la primera deuda (positivo = quedan, negativo = venció). */
  daysUntil30?: number | null;
  overdueAmount?: number;
  overdueLabel?: string | null;
  nextDueInDays?: number | null;
};

function getDebtAgingSummary(
  movements: MovementAgingRow[],
  nowMs: number
): {
  oldestOpenDebtDate: string | null;
  overdueAmount: number;
  firstOverdueReferenceType: string | null;
  firstOverdueReferenceId: string | null;
  firstOverdueNote: string | null;
  nextDueInDays: number | null;
  nextUpcomingReferenceType: string | null;
  nextUpcomingReferenceId: string | null;
  nextUpcomingNote: string | null;
} {
  const debtQueue: Array<{
    createdAt: string;
    remaining: number;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
  }> = [];
  const EPSILON = 0.0001;
  const MS_PER_DAY = 86400000;
  const DAYS_LIMIT = 30;

  for (const move of movements) {
    const amount = Number(move.amount ?? 0);
    if (!Number.isFinite(amount) || amount === 0) continue;

    if (move.movement_type === "DEBT" && amount > 0) {
      debtQueue.push({
        createdAt: move.created_at,
        remaining: amount,
        referenceType: move.reference_type,
        referenceId: move.reference_id,
        note: move.note
      });
      continue;
    }

    if (amount < 0) {
      let credit = Math.abs(amount);
      for (const debt of debtQueue) {
        if (credit <= EPSILON) break;
        if (debt.remaining <= EPSILON) continue;
        const applied = Math.min(credit, debt.remaining);
        debt.remaining -= applied;
        credit -= applied;
      }
    }
  }

  let oldestOpenDebtDate: string | null = null;
  let overdueAmount = 0;
  let firstOverdueReferenceType: string | null = null;
  let firstOverdueReferenceId: string | null = null;
  let firstOverdueNote: string | null = null;
  let nextDueInDays: number | null = null;
  let nextUpcomingReferenceType: string | null = null;
  let nextUpcomingReferenceId: string | null = null;
  let nextUpcomingNote: string | null = null;

  for (const debt of debtQueue) {
    if (debt.remaining <= EPSILON) continue;
    if (!oldestOpenDebtDate) oldestOpenDebtDate = debt.createdAt;

    const elapsed = (nowMs - new Date(debt.createdAt).getTime()) / MS_PER_DAY;
    const daysUntilDue = Math.floor(DAYS_LIMIT - elapsed);

    if (daysUntilDue < 0) {
      overdueAmount += debt.remaining;
      if (!firstOverdueReferenceType && !firstOverdueReferenceId && !firstOverdueNote) {
        firstOverdueReferenceType = debt.referenceType;
        firstOverdueReferenceId = debt.referenceId;
        firstOverdueNote = debt.note;
      }
      continue;
    }

    if (nextDueInDays == null || daysUntilDue < nextDueInDays) {
      nextDueInDays = daysUntilDue;
      nextUpcomingReferenceType = debt.referenceType;
      nextUpcomingReferenceId = debt.referenceId;
      nextUpcomingNote = debt.note;
    }
  }

  return {
    oldestOpenDebtDate,
    overdueAmount: Number(overdueAmount.toFixed(2)),
    firstOverdueReferenceType,
    firstOverdueReferenceId,
    firstOverdueNote,
    nextDueInDays,
    nextUpcomingReferenceType,
    nextUpcomingReferenceId,
    nextUpcomingNote
  };
}

export default function AccountsPage() {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    setMessage(null);
    setLoading(true);
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .order("full_name", { ascending: true });
    if (error) {
      setMessage("Error al cargar clientes");
      setItems([]);
      setLoading(false);
      return;
    }

    const list = (customers ?? []) as CustomerRow[];
    if (list.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const ids = list.map((c) => c.id);
    const [{ data: accounts }, { data: balances }] = await Promise.all([
      supabase
        .from("current_accounts")
        .select("id, customer_id, status")
        .in("customer_id", ids),
      supabase
        .from("v_account_balance")
        .select("customer_id, balance")
        .in("customer_id", ids)
    ]);

    const accountMap = new Map<string, AccountRow>();
    for (const row of (accounts ?? []) as AccountRow[]) {
      accountMap.set(row.customer_id, row);
    }
    const balanceMap = new Map<string, number>();
    for (const row of (balances ?? []) as BalanceRow[]) {
      balanceMap.set(row.customer_id, row.balance ?? 0);
    }

    const accountIdsWithDebt = (accounts ?? [])
      .filter((a) => (balanceMap.get(a.customer_id) ?? 0) > 0)
      .map((a) => a.id);
    let debtAgingByAccount = new Map<
      string,
      {
        oldestOpenDebtDate: string | null;
        overdueAmount: number;
        firstOverdueReferenceType: string | null;
        firstOverdueReferenceId: string | null;
        firstOverdueNote: string | null;
        nextDueInDays: number | null;
        nextUpcomingReferenceType: string | null;
        nextUpcomingReferenceId: string | null;
        nextUpcomingNote: string | null;
      }
    >();
    const now = Date.now();
    if (accountIdsWithDebt.length > 0) {
      const { data: movementRows } = await supabase
        .from("account_movements")
        .select("account_id, movement_type, amount, created_at, reference_type, reference_id, note")
        .in("account_id", accountIdsWithDebt)
        .order("created_at", { ascending: true });

      const grouped = new Map<string, MovementAgingRow[]>();
      for (const row of (movementRows ?? []) as MovementAgingRow[]) {
        const listForAccount = grouped.get(row.account_id) ?? [];
        listForAccount.push(row);
        grouped.set(row.account_id, listForAccount);
      }

      const byAccount = new Map<
        string,
        {
          oldestOpenDebtDate: string | null;
          overdueAmount: number;
          firstOverdueReferenceType: string | null;
          firstOverdueReferenceId: string | null;
          firstOverdueNote: string | null;
          nextDueInDays: number | null;
          nextUpcomingReferenceType: string | null;
          nextUpcomingReferenceId: string | null;
          nextUpcomingNote: string | null;
        }
      >();
      for (const accountId of accountIdsWithDebt) {
        const summary = getDebtAgingSummary(grouped.get(accountId) ?? [], now);
        byAccount.set(accountId, summary);
      }
      debtAgingByAccount = byAccount;
    }

    const saleIdsForLabels = Array.from(
      new Set(
        Array.from(debtAgingByAccount.values())
          .flatMap((entry) => {
            const ids: string[] = [];
            if (entry.nextUpcomingReferenceType === "SALE" && entry.nextUpcomingReferenceId) {
              ids.push(entry.nextUpcomingReferenceId);
            }
            if (entry.firstOverdueReferenceType === "SALE" && entry.firstOverdueReferenceId) {
              ids.push(entry.firstOverdueReferenceId);
            }
            return ids;
          })
      )
    );
    const saleLabelById = new Map<string, string>();
    if (saleIdsForLabels.length > 0) {
      const { data: saleItemsData } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, quantity")
        .in("sale_id", saleIdsForLabels);
      const saleItems = (saleItemsData ?? []) as {
        sale_id: string;
        product_id: string;
        quantity: number;
      }[];
      const productIds = Array.from(new Set(saleItems.map((s) => s.product_id)));
      const productNameById = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds);
        for (const p of (productsData ?? []) as { id: string; name: string }[]) {
          productNameById.set(p.id, p.name);
        }
      }
      for (const saleId of saleIdsForLabels) {
        const label = saleItems
          .filter((item) => item.sale_id === saleId)
          .map((item) => `${item.quantity}x ${productNameById.get(item.product_id) ?? "Producto"}`)
          .join(", ");
        if (label) saleLabelById.set(saleId, label);
      }
    }

    const MS_PER_DAY = 86400000;
    const DAYS_LIMIT = 30;

    const next: AccountListItem[] = list.map((c) => {
      const balance = balanceMap.get(c.id) ?? 0;
      const account = accountMap.get(c.id);
      const debtAging = account ? debtAgingByAccount.get(account.id) : undefined;
      const oldestAt = debtAging?.oldestOpenDebtDate ?? null;
      let daysUntil30: number | null = null;
      if (oldestAt && balance > 0) {
        const elapsed = (now - new Date(oldestAt).getTime()) / MS_PER_DAY;
        daysUntil30 = Math.floor(DAYS_LIMIT - elapsed);
      }
      const overdueLabel =
        debtAging?.firstOverdueNote?.trim()
          ? debtAging.firstOverdueNote.trim()
          : debtAging?.firstOverdueReferenceType === "SALE" &&
              debtAging.firstOverdueReferenceId
            ? saleLabelById.get(debtAging.firstOverdueReferenceId) ?? "Compra fiada"
            : debtAging?.firstOverdueReferenceType === "MANUAL"
              ? "Deuda manual"
              : "Deuda";
      return {
        id: c.id,
        fullName: c.full_name,
        phone: c.phone,
        status: (account?.status ?? "SIN CUENTA") as AccountListItem["status"],
        balance,
        oldestDebtAt: oldestAt ?? null,
        daysUntil30: daysUntil30 ?? null,
        overdueAmount: debtAging?.overdueAmount ?? 0,
        overdueLabel,
        nextDueInDays: debtAging?.nextDueInDays ?? null,
      };
    });

    setItems(next);
    setLoading(false);
  }

  const statusStyle = useMemo(
    () => ({
      PROBANDO: {
        border: "border-l-4 border-l-amber-500",
        card: "bg-amber-50/50 hover:bg-amber-50/80 border-amber-100",
        badge: "bg-amber-100 text-amber-800 border-amber-200",
      },
      DEUDA: {
        border: "border-l-4 border-l-rose-500",
        card: "bg-rose-50/50 hover:bg-rose-50/80 border-rose-100",
        badge: "bg-rose-100 text-rose-800 border-rose-200",
      },
      CANCELADO: {
        border: "border-l-4 border-l-teal-500",
        card: "bg-teal-50/50 hover:bg-teal-50/80 border-teal-100",
        badge: "bg-teal-100 text-teal-800 border-teal-200",
      },
      "SIN CUENTA": {
        border: "border-l-4 border-l-slate-400",
        card: "bg-white hover:bg-slate-50/80 border-slate-200",
        badge: "bg-slate-100 text-slate-600 border-slate-200",
      },
    }),
    []
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = term
      ? items.filter(
          (item) =>
            item.fullName.toLowerCase().includes(term) ||
            (item.phone ?? "").toLowerCase().includes(term)
        )
      : [...items];
    list.sort((a, b) => {
      const aDebt = a.balance > 0 ? 1 : 0;
      const bDebt = b.balance > 0 ? 1 : 0;
      if (aDebt !== bDebt) return bDebt - aDebt;
      if (a.balance <= 0 && b.balance <= 0) return 0;
      const aDays = a.daysUntil30 ?? 9999;
      const bDays = b.daysUntil30 ?? 9999;
      return aDays - bDays;
    });
    return list;
  }, [items, search]);

  const PAGE_SIZE = 12;
  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () =>
      filteredItems.slice(
        pageIndex * PAGE_SIZE,
        pageIndex * PAGE_SIZE + PAGE_SIZE
      ),
    [filteredItems, pageIndex]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [search]);

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Clientes
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Cuentas corrientes y saldo. Buscá por nombre o teléfono.
            </p>
          </div>
          <Link
            href="/accounts/new"
            className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Nuevo cliente
          </Link>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
            <label className="block text-sm font-medium text-slate-700">
              Buscar cliente
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o teléfono"
              className="mt-2 h-10 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-4 py-12 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
              Cargando clientes…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No hay clientes cargados. Creá el primero para comenzar.
            </div>
          )}
          {!loading && items.length > 0 && filteredItems.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              Ningún cliente coincide con la búsqueda.
            </div>
          )}
          {!loading && items.length > 0 && filteredItems.length > 0 && (
            <>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                {paginatedItems.map((item) => {
                  const style = statusStyle[item.status];
                  return (
                    <Link
                      key={item.id}
                      href={`/accounts/${item.id}`}
                      className={`rounded-xl border ${style.border} ${style.card} p-4 shadow-sm transition hover:shadow-md`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {item.fullName}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {item.phone ?? "Sin teléfono"}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-3">
                        {item.balance > 0 && (item.overdueAmount ?? 0) > 0 && (
                          <p className="text-xs font-medium text-rose-700">
                            Deuda vencida: {item.overdueLabel ?? "Deuda"}
                          </p>
                        )}
                        {item.balance > 0 && item.nextDueInDays != null && (
                          <p className="text-xs font-medium text-slate-600">
                            Próxima a vencer{" "}
                            {item.nextDueInDays > 0
                              ? `en ${item.nextDueInDays} día${item.nextDueInDays !== 1 ? "s" : ""}`
                              : "hoy"}
                          </p>
                        )}
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Saldo
                          </span>
                          <span
                            className={`text-xl font-bold tabular-nums ${
                              item.balance > 0 ? "text-rose-600" : "text-teal-600"
                            }`}
                          >
                            {item.balance > 0 ? "+" : ""}
                            {item.balance.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 sm:px-5">
                  <span className="text-xs text-slate-500">
                    {filteredItems.length} cliente{filteredItems.length !== 1 ? "s" : ""}
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
