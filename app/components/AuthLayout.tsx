"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavBar from "./NavBar";

const AUTH_PATHS = ["/login", "/signup", "/sin-acceso"];

export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold tracking-wide text-slate-900 transition hover:bg-slate-100"
          >
            STONE
          </Link>
          <NavBar />
        </div>
      </header>
      {children}
    </>
  );
}
