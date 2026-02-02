"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Panel" },
  { href: "/pos", label: "POS" },
  { href: "/sales", label: "Ventas" },
  { href: "/products", label: "Productos" },
  { href: "/accounts", label: "Clientes" },
  { href: "/exchange", label: "Cambios" },
  { href: "/reports", label: "Reportes" },
  { href: "/guia", label: "Guía" },
  { href: "/integrations/mercadolibre", label: "ML" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Principal">
      {links.map(({ href, label }) => {
        const isActive =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-teal-100 text-teal-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
