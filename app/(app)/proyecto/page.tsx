import { resolveHolder } from "@/lib/session";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { m2Equivalent } from "@/lib/engine";
import { ledgerBalances } from "@/lib/ledger";
import { num, usd } from "@/lib/money";
import { PageHead } from "@/components/ui";

interface Project { id: number; name: string; developer: string; address: string; unit: string; typology: string; surface_m2: string; ref_price_cents: number; delivery: string; source_url: string; source_note: string; image_url: string | null }

export default async function ProjectPage() {
  const { holder } = await resolveHolder();
  const db = getDb();
  const p = db.prepare("SELECT * FROM projects ORDER BY id LIMIT 1").get() as Project | undefined;
  if (!p) return (<><PageHead title="Proyecto referencial" /><div className="card empty">Sin proyecto cargado.</div></>);
  const prices = db.prepare("SELECT * FROM m2_prices WHERE project_id = ? ORDER BY effective_date DESC, id DESC").all(p.id) as { price_cents: number; effective_date: string; source: string }[];
  const current = prices[0];
  const capital = holder && holder.kind === "token" ? ledgerBalances(holder.id).capitalCents : 0;
  const m2 = current ? m2Equivalent(capital, current.price_cents) : null;
  return (
    <>
      <PageHead title="Proyecto referencial" sub="Información de la unidad que sirve de referencia. Es secundaria a tu portfolio." />
      <div className="grid cols-2">
        <div className="card">
          <h2>{p.name} · Unidad {p.unit}</h2>
          <dl className="kv">
            <dt>Desarrolladora</dt><dd>{p.developer}</dd>
            <dt>Dirección</dt><dd>{p.address}</dd>
            <dt>Tipología</dt><dd>{p.typology}</dd>
            <dt>Superficie total publicada</dt><dd>{p.surface_m2} m²</dd>
            <dt>Precio referencial de contado</dt><dd>{usd(p.ref_price_cents)}</dd>
            <dt>Precio referencial del m²</dt><dd>{current ? usd(current.price_cents) : "—"}</dd>
            <dt>Entrega</dt><dd>{p.delivery}</dd>
          </dl>
          {p.image_url ? <img src={p.image_url} alt={`Plano de la unidad ${p.unit}`} style={{ width: "100%", borderRadius: 12, marginTop: 16 }} /> : <p className="note" style={{ marginTop: 16 }}>Plano o imagen real: no disponible todavía.</p>}
          <p className="note">Fuente: <a href={p.source_url} target="_blank" rel="noreferrer">{p.source_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>. {p.source_note}</p>
        </div>
        <div className="card">
          <h2>Equivalencia orientativa en metros</h2>
          {holder?.kind === "token" && m2 !== null ? (
            <>
              <p style={{ fontSize: "1.6rem", fontWeight: 700, margin: "4px 0" }} className="num">{num(m2, 2)} m²</p>
              <p className="muted">Tu capital activo ({usd(capital)}) dividido por el precio referencial vigente del m² ({usd(current!.price_cents)}, al {formatDate(current!.effective_date)}).</p>
            </>
          ) : <p className="muted">Con USD 1.000 por m², USD 100 equivalen orientativamente a 0,10 m².</p>}
          <ul className="muted">
            <li>Es una referencia: no son metros de tu propiedad.</li>
            <li>Si sube el precio del m², la equivalencia baja; tu capital en dólares y tus tokens no cambian por eso.</li>
            <li>La valorización del departamento no incrementa automáticamente tu inversión.</li>
          </ul>
          <h3 style={{ marginTop: 16 }}>Historial del valor referencial</h3>
          <table><thead><tr><th>Desde</th><th className="r">USD/m²</th><th>Fuente</th></tr></thead>
            <tbody>{prices.map((x, i) => <tr key={i}><td>{formatDate(x.effective_date)}</td><td className="r num">{usd(x.price_cents)}</td><td>{x.source}</td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
