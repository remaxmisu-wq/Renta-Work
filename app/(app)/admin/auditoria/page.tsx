import { getDb } from "@/lib/db";
import { PageHead } from "@/components/ui";

export default async function AuditPage() {
  const rows = getDb().prepare(
    "SELECT a.*, u.name actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 200",
  ).all() as { id: number; at: string; actor: string | null; action: string; entity: string | null; entity_id: number | null; data: string | null }[];
  return (
    <>
      <PageHead title="Auditoría" sub="Responsable y fecha de cada acción." />
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>Fecha (UTC)</th><th>Responsable</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td className="num">{r.at}</td><td>{r.actor ?? "Sistema"}</td><td>{r.action}</td><td>{r.entity ? `${r.entity} #${r.entity_id ?? ""}` : "—"}</td><td><code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{r.data}</code></td></tr>
        ))}</tbody>
      </table></div></div>
    </>
  );
}
