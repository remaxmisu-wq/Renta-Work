import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { realOperationsEnabled } from "@/lib/ledger";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [
    { href: "/", label: "Mi portfolio" },
    { href: "/movimientos", label: "Movimientos" },
    { href: "/documentos", label: "Documentos" },
    { href: "/proyecto", label: "Proyecto" },
    { href: "/inversores", label: "Inversores" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Administración" }] : []),
  ];
  return (
    <>
      {!realOperationsEnabled() && (
        <div className="banner pilot">
          Versión piloto: todavía no se reciben fondos reales. Las condiciones se confirman por contrato.
        </div>
      )}
      {user.is_demo ? <div className="banner demo">Estás usando un usuario de demostración. Los datos no son reales.</div> : null}
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/" className="brand">Renta<span>Work</span></a>
          <Nav items={items} />
          <div className="user">
            <span className="hide-sm">{user.name}</span>
            <form action={logoutAction}><button className="btn small" type="submit">Salir</button></form>
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
    </>
  );
}
