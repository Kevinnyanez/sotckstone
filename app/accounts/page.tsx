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

type AccountListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  status: AccountRow["status"] | "SIN CUENTA";
  balance: number;
};

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

    const next: AccountListItem[] = list.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phone: c.phone,
      status: (accountMap.get(c.id)?.status ?? "SIN CUENTA") as AccountListItem["status"],
      balance: balanceMap.get(c.id) ?? 0
    }));

    setItems(next);
    setLoading(false);
  }

  const statusTone = useMemo(
    () => ({
      PROBANDO: "bg-amber-50 text-amber-700 border-amber-200",
      DEUDA: "bg-rose-50 text-rose-700 border-rose-200",
      CANCELADO: "bg-emerald-50 text-emerald-700 border-emerald-200",
      "SIN CUENTA": "bg-slate-100 text-slate-600 border-slate-200"
    }),
    []
  );

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.fullName.toLowerCase().includes(term) ||
        (item.phone ?? "").toLowerCase().includes(term)
    );
  }, [items, search]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Clientes</h1>
            <p className="mt-1 text-sm text-slate-500">
              Cuentas corrientes activas y saldo disponible.
            </p>
          </div>
          <Link
            href="/accounts/new"
            className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Nuevo cliente
          </Link>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <label className="text-sm font-medium text-slate-700">
              Buscar cliente
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o teléfono"
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          {loading && (
            <p className="text-sm text-slate-500">Cargando clientes...</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-sm text-slate-500">
              No hay clientes cargados. Cree el primero para comenzar.
            </p>
          )}
          {!loading && items.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/accounts/${item.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="text-sm text-slate-500">Cliente</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {item.fullName}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    {item.phone ?? "Sin teléfono"}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase text-slate-500">Saldo</div>
                      <div
                        className={`text-xl font-semibold ${
                          item.balance > 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {item.balance.toFixed(2)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[item.status]}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {message && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
