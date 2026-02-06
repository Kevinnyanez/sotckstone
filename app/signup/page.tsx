"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase/browser";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Error al crear la cuenta");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100/80 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Crear cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">
          El primer usuario que se registre será administrador.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={6}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <span className="mt-0.5 block text-xs text-slate-500">Mínimo 6 caracteres</span>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-teal-600 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
