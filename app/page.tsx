import Link from "next/link";

const APPY_LOGO_PATH = "/img/1sinfondo.png";
const CONTACT_IG = "https://www.instagram.com/appystudiosweb/?hl=es";
const CONTACT_WP = "https://wa.me/5492922442186";

export default function Home() {
  return (
    <main className="h-screen flex flex-col bg-slate-100/80 text-slate-900 overflow-hidden">
      <div className="mx-auto max-w-6xl flex-1 w-full min-h-0 overflow-y-auto px-4 py-8 sm:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Panel principal
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 sm:text-base">
            Sistema de gestión de stock con Mercado Libre integrado desarrollado por Appy Studios.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Accedé rápido al punto de venta, productos, clientes, cambios y ventas.
          </p>
        </header>

        <section
          aria-label="Accesos rápidos"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Link
            href="/pos"
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-600 transition group-hover:bg-teal-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900">Punto de Venta</div>
              <p className="mt-0.5 text-sm text-slate-500">Cobros rápidos y carga de ventas.</p>
            </div>
          </Link>
          <Link
            href="/products"
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900">Productos</div>
              <p className="mt-0.5 text-sm text-slate-500">Catálogo, precios y stock actual.</p>
            </div>
          </Link>
          <Link
            href="/sales"
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900">Ventas</div>
              <p className="mt-0.5 text-sm text-slate-500">Listado y revisión de ventas realizadas.</p>
            </div>
          </Link>
          <Link
            href="/accounts"
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900">Clientes</div>
              <p className="mt-0.5 text-sm text-slate-500">Cuentas corrientes y pagos.</p>
            </div>
          </Link>
          <Link
            href="/exchange"
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-200">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900">Cambios</div>
              <p className="mt-0.5 text-sm text-slate-500">Entrada y salida de prendas.</p>
            </div>
          </Link>
        </section>
      </div>

      <footer className="mt-auto shrink-0 border-t border-slate-200 bg-white/90 py-10 sm:py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <a
              href="https://appystudios.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition"
              aria-label="Appy Studios"
            >
              <img
                src={APPY_LOGO_PATH}
                alt="Appy Studios"
                className="h-14 w-auto max-w-[180px] object-contain object-left"
              />
            </a>
            <span className="text-sm text-slate-500 sm:text-base">Desarrollado por Appy Studios</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href={CONTACT_IG}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm sm:text-base font-medium text-slate-600 hover:text-teal-600 transition"
              aria-label="Instagram"
            >
              Instagram
            </a>
            <a
              href={CONTACT_WP}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm sm:text-base font-medium text-slate-600 hover:text-teal-600 transition"
              aria-label="WhatsApp"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
