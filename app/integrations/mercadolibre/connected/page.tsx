import Link from "next/link";

export default function MercadoLibreConnectedPage() {
  return (
    <main className="min-h-screen bg-slate-100/80 text-slate-900">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Mercado Libre conectado correctamente
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            La cuenta de Mercado Libre quedó vinculada. Podés usar la integración para vincular productos y, cuando esté activo, sincronizar stock.
          </p>
          <Link
            href="/integrations/mercadolibre"
            className="mt-6 inline-block rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Ir a integración ML
          </Link>
          <Link
            href="/"
            className="mt-3 block text-sm font-medium text-slate-600 hover:text-teal-600"
          >
            Volver al panel
          </Link>
        </div>
      </div>
    </main>
  );
}
