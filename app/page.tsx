import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 p-6">
        <header className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Panel principal
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-600 sm:text-lg">
            Accedé rápido al punto de venta, productos, clientes, cambios y ventas.
          </p>
        </header>

        <section
          aria-label="Accesos rápidos"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Link
            href="/pos"
            className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-3xl">🧾</div>
            <div>
              <div className="text-lg font-semibold">Punto de Venta</div>
              <p className="mt-1 text-sm text-slate-500">
                Cobros rápidos y carga de ventas.
              </p>
            </div>
          </Link>
          <Link
            href="/products"
            className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-3xl">📦</div>
            <div>
              <div className="text-lg font-semibold">Productos</div>
              <p className="mt-1 text-sm text-slate-500">
                Catálogo, precios y stock actual.
              </p>
            </div>
          </Link>
          <Link
            href="/sales"
            className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-3xl">📊</div>
            <div>
              <div className="text-lg font-semibold">Ventas</div>
              <p className="mt-1 text-sm text-slate-500">
                Listado y revisión de ventas realizadas.
              </p>
            </div>
          </Link>
          <Link
            href="/accounts"
            className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-3xl">👥</div>
            <div>
              <div className="text-lg font-semibold">Clientes</div>
              <p className="mt-1 text-sm text-slate-500">
                Cuentas corrientes y pagos.
              </p>
            </div>
          </Link>
          <Link
            href="/exchange"
            className="group flex min-h-[180px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-3xl">🔁</div>
            <div>
              <div className="text-lg font-semibold">Cambios</div>
              <p className="mt-1 text-sm text-slate-500">
                Entrada y salida de prendas.
              </p>
            </div>
          </Link>
        </section>
      </div>
    </main>
  );
}
