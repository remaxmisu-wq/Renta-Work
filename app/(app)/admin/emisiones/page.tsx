import { m2PriceAction, saveEmissionAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { formatDate, today } from "@/lib/dates";
import { capUsage, type Emission } from "@/lib/ledger";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHead } from "@/components/ui";

function EmissionForm({ e }: { e?: Emission }) {
  return (
    <form action={saveEmissionAction} className="form">
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="inline-form">
        <label>Nombre<input name="name" defaultValue={e?.name} required /></label>
        <label>Tasa nominal anual %<input name="rate" defaultValue={e ? String(e.rate_bps / 100).replace(".", ",") : "12"} required /></label>
        <label>Plazo (meses)<input name="term" type="number" defaultValue={e?.term_months ?? ""} /></label>
        <label>Estado del plazo
          <select name="term_status" defaultValue={e?.term_status ?? "propuesta"}><option value="propuesta">Propuesta (pendiente)</option><option value="confirmado">Confirmado por contrato</option></select>
        </label>
        <label>Cupo de captación (USD)<input name="cap" defaultValue={e?.cap_cents != null ? String(e.cap_cents / 100) : ""} placeholder="Sin definir" /></label>
      </div>
      <label className="check"><input type="checkbox" name="cap_reinv" defaultChecked={e ? !!e.cap_includes_reinvestments : true} /><span>Las reinversiones consumen cupo</span></label>
      <label className="check"><input type="checkbox" name="open" defaultChecked={e ? !!e.open : true} /><span>Emisión abierta a nuevas compras y reinversiones</span></label>
      <label>Devolución anticipada<textarea name="early" rows={2} defaultValue={e?.early_redemption_terms ?? ""} placeholder="A definir por contrato" /></label>
      <label>Condiciones de salida<textarea name="exit" rows={2} defaultValue={e?.exit_terms ?? ""} placeholder="A definir por contrato" /></label>
      <SubmitButton className="btn small">Guardar emisión</SubmitButton>
    </form>
  );
}

export default async function EmissionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const emissions = db.prepare("SELECT * FROM emissions ORDER BY id DESC").all() as Emission[];
  const project = db.prepare("SELECT * FROM projects ORDER BY id LIMIT 1").get() as { id: number; name: string; unit: string } | undefined;
  const prices = project ? (db.prepare("SELECT * FROM m2_prices WHERE project_id = ? ORDER BY effective_date DESC").all(project.id) as { price_cents: number; effective_date: string; source: string; created_at: string }[]) : [];
  return (
    <>
      <PageHead title="Emisiones y proyecto" sub="Tasa, plazo, cupo y condiciones. El cupo se define aparte del valor del departamento." />
      <Flash sp={sp} />
      {emissions.map((e) => {
        const c = capUsage(e.id);
        return (
          <div className="card" key={e.id}>
            <h2>{e.name} {e.is_demo ? <span className="badge demo">DEMO</span> : null}</h2>
            <p className="muted">Usado {usd(c.usedCents)} · reservado {usd(c.reservedCents)} · disponible {c.remainingCents == null ? "sin definir" : usd(c.remainingCents)} · dinero nuevo {usd(c.newMoneyCents)} · reinversiones {usd(c.reinvestedCents)}</p>
            <EmissionForm e={e} />
          </div>
        );
      })}
      <div className="card section"><h2>Nueva emisión</h2><EmissionForm /></div>
      {project && (
        <div className="card section">
          <h2>Valor referencial del m² · {project.name} {project.unit}</h2>
          <form action={m2PriceAction} className="inline-form">
            <input type="hidden" name="project" value={project.id} />
            <label>USD por m²<input name="price" required /></label>
            <label>Vigente desde<input type="date" name="date" defaultValue={today()} required /></label>
            <label>Fuente<input name="source" required placeholder="Ej.: simulador-pc.web.app" /></label>
            <SubmitButton className="btn small">Registrar</SubmitButton>
          </form>
          <table style={{ marginTop: 12 }}><thead><tr><th>Desde</th><th className="r">USD/m²</th><th>Fuente</th><th>Cargado</th></tr></thead>
            <tbody>{prices.map((p, i) => <tr key={i}><td>{formatDate(p.effective_date)}</td><td className="r num">{usd(p.price_cents)}</td><td>{p.source}</td><td>{p.created_at.slice(0, 10)}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}
