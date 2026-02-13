"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getSupabaseClient } from "../../../../lib/supabaseClient";

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
};

type FormState = {
  name: string;
  phone: string;
  address: string;
};

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const customerId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = getSupabaseClient();
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState<FormState>({ name: "", phone: "", address: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!customerId) return;
    void loadCustomer();
  }, [customerId]);

  async function loadCustomer() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, full_name, phone, address")
      .eq("id", customerId)
      .maybeSingle();
    if (error || !data) {
      setMessage("No se pudo cargar el cliente");
      setCustomer(null);
      setLoading(false);
      return;
    }
    const row = data as CustomerRow;
    setCustomer(row);
    setForm({
      name: row.full_name ?? "",
      phone: row.phone ?? "",
      address: row.address ?? ""
    });
    setLoading(false);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCustomer() {
    const payload: Record<string, string | null> = {
      full_name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null
    };

    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", customerId);

    if (error) {
      setMessage(`Error al guardar: ${error.message}`);
      return;
    }
    router.push(`/accounts/${customerId}`);
  }

  function handleSubmit() {
    setMessage(null);
    if (!form.name.trim()) {
      setMessage("El nombre es obligatorio.");
      return;
    }
    startTransition(() => {
      void saveCustomer();
    });
  }

  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Editar cliente
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {customer?.full_name ?? "Cargando…"}
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
            <div className="flex gap-2 py-8 text-sm text-slate-500">
              <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-slate-200" />
              Cargando datos…
            </div>
          )}
          {!loading && customer && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Nombre
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Ej: María Pérez"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Teléfono
                <input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Ej: 11 5555 0000"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                Dirección (opcional)
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Ej: Av. Corrientes 1234"
                />
              </label>
            </div>
          )}

          {message && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {message}
            </p>
          )}

          {!loading && customer && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="h-11 rounded-lg bg-teal-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
              <Link
                href={`/accounts/${customerId}`}
                className="h-11 rounded-lg border border-slate-300 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
