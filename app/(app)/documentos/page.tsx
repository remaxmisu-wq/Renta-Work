import { resolveHolder, str, type SP } from "@/lib/session";
import { getDb } from "@/lib/db";
import { PageHead } from "@/components/ui";

const KINDS: Record<string, string> = { contrato: "Contrato", comprobante: "Comprobante", rendicion: "Rendición", otro: "Otro" };

export default async function DocumentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { holder } = await resolveHolder(str(sp.titular));
  const docs = holder
    ? (getDb().prepare("SELECT * FROM documents WHERE holder_id = ? ORDER BY created_at DESC").all(holder.id) as { id: number; title: string; kind: string; created_at: string }[])
    : [];
  return (
    <>
      <PageHead title="Mis documentos" sub="Contratos, comprobantes y rendiciones. Son privados: sólo los ves vos y el administrador." />
      <div className="card">
        {docs.length === 0 ? <p className="muted">Todavía no hay documentos cargados.</p> : (
          <ul className="list">
            {docs.map((d) => (
              <li key={d.id}><span><a href={`/api/documentos/${d.id}`}>{d.title}</a><br /><small>{KINDS[d.kind] ?? d.kind}</small></span><small>{d.created_at.slice(0, 10).split("-").reverse().join("/")}</small></li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
