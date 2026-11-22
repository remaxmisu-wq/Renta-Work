"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Inicio", d: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" },
  { href: "/invertir", label: "Invertir", d: "M12 5v14M5 12h14" },
  { href: "/movimientos", label: "Movimientos", d: "M5 7h14M5 12h14M5 17h9" },
  { href: "/inversion", label: "Todos", d: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5" },
];

/** Menú inferior en el celular. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Menú">
      {ITEMS.map((i) => {
        const active = i.href === "/" ? !ITEMS.slice(1).some((o) => path.startsWith(o.href)) && !path.startsWith("/admin") : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={active ? "active" : ""} data-bottom={i.href}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={i.d} /></svg>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
