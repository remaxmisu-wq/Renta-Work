"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Secciones">
      {items.map((i) => {
        // "/" (Mi panel) también queda activo en sus subpantallas (invertir, intereses, movimientos…).
        const others = items.filter((o) => o.href !== "/").some((o) => path === o.href || path.startsWith(o.href + "/"));
        const active = i.href === "/" ? !others : path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} className={active ? "active" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
