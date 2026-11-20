import { uploadDocumentAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHead } from "@/components/ui";

export default async function AdminDocumentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const holders = db.prepare("SELECT id, name FROM holders ORDER BY name").all() as { id: number; name: string }[];
  const docs = db.prepare("SELECT d.*, h.name holder_name FROM documents d JOIN holders h ON h.id = d.holder_id ORDER BY d.id DESC LIMIT 100").all() as { id: number; title: string; kind: string; holder_name: string; created_at: string }[];
  return (
    <>
      <PageHead title="Documentos" sub="Contratos, comprobantes y rendiciones privados de cada titular." />
      <Flash sp={sp} />
      <div className="card">
        <form action={uploadDocumentAction} className="inline-form">
          <label>Titular<select name="holder">{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label>Tipo<select name="kind"><option value="contrato">Contrato</option><option value="comprobante">Comprobante</option><option value="rendicion">Rendición</option><option value="otro">Otro</option></select></label>
          <label>Título<input name="title" /></label>
          <label>Archivo<input type="file" name="file" required /></label>
          <SubmitButton className="btn small">Cargar</SubmitButton>
        </form>
      </div>
      <div className="card section">
        <table><tbody>{docs.map((d) => (
          <tr key={d.id}><td><a href={`/api/documentos/${d.id}`}>{d.title}</a></td><td>{d.kind}</td><td>{d.holder_name}</td><td>{d.created_at.slice(0, 10)}</td></tr>
        ))}</tbody></table>
      </div>
    </>
  );
}
