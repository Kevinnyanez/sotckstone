import Link from "next/link";

export default function SinAccesoPage() {
  return (
    <main className="min-h-screen bg-slate-100/80 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">Sin acceso</h1>
        <p className="mt-2 text-sm text-slate-500">
          Solo los administradores pueden usar esta aplicación. Si creés que deberías tener acceso, contactá al administrador.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        >
          Volver al login
        </Link>
      </div>
    </main>
  );
}
