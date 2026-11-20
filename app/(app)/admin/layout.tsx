import { requireAdmin } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <div className="card" style={{ padding: 8, marginBottom: 20 }}>
        <Nav items={[
          { href: "/admin", label: "Resumen" },
          { href: "/admin/solicitudes", label: "Solicitudes" },
          { href: "/admin/liquidaciones", label: "Liquidaciones" },
          { href: "/admin/titulares", label: "Titulares" },
          { href: "/admin/emisiones", label: "Emisiones y proyecto" },
          { href: "/admin/comisiones", label: "Comisiones" },
          { href: "/admin/movimientos", label: "Movimientos" },
          { href: "/admin/documentos", label: "Documentos" },
          { href: "/admin/usuarios", label: "Usuarios" },
          { href: "/admin/auditoria", label: "Auditoría" },
        ]} />
      </div>
      {children}
    </>
  );
}
