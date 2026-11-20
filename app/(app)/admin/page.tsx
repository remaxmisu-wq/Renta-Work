import Link from "next/link";
import { formatDate, formatDateLong, monthLabel, today } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { adminOverview } from "@/lib/views";
import { DemoBadge, PageHead, Stat } from "@/components/ui";

export default async function AdminHome() {
  const asOf = today();
  const o = adminOverview(asOf);
  const due = o.calendar.filter((c) => c.date <= asOf && c.kind === "liquidacion");
  const maxCash = Math.max(1, ...o.cashProjection.map((m) => m.interestCents + m.capitalCents));
  return (
    <>
      <PageHead title="Panel administrativo" sub={`Datos reales al ${formatDateLong(asOf)}. Los titulares de demostración se excluyen de los totales.`} />
      {due.length > 0 && <div className="alert warn">Hay {due.length} liquidaciones vencidas sin ejecutar. <Link href="/admin/liquidaciones">Ejecutar liquidaciones</Link></div>}
      {o.pendingRequests > 0 && <div className="alert info">{o.pendingRequests} solicitudes esperan revisión. <Link href="/admin/solicitudes">Ver solicitudes</Link></div>}
      <div className="grid stats">
        <Stat label="Capital pendiente total" tone="capital" dot="navy" value={usd(o.capitalCents)} />
        <Stat label="Intereses en curso" tone="interest" dot="lightgreen" value={usd(o.accruedCents)} />
        <Stat label="Intereses liquidados pendientes de pago" tone="interest" dot="green" value={usd(o.availableCents)} />
        <Stat label="Cupo disponible" value={o.cap?.remainingCents == null ? "Sin definir" : usd(o.cap.remainingCents)}
          hint={o.emission ? `${o.emission.name} · cupo ${o.cap?.capCents == null ? "sin definir" : usd(o.cap.capCents)}${o.emission.cap_includes_reinvestments ? " · incluye reinversiones" : " · sólo dinero nuevo"}` : "Sin emisión abierta"} />
      </div>
      <div className="grid cols-2 section">
        <div className="card">
          <h2>Emisión vigente</h2>
          {o.emission && o.cap ? (
            <dl className="kv">
              <dt>Tasa</dt><dd>{pct(o.emission.rate_bps)}</dd>
              <dt>Plazo</dt><dd>{o.emission.term_months ? `${o.emission.term_months} meses (${o.emission.term_status})` : "A definir"}</dd>
              <dt>Dinero nuevo recibido</dt><dd>{usd(o.cap.newMoneyCents)}</dd>
              <dt>Reinversiones (no son efectivo)</dt><dd>{usd(o.cap.reinvestedCents)}</dd>
              <dt>Solicitudes abiertas (reservan cupo)</dt><dd>{usd(o.cap.reservedCents)}</dd>
              <dt>Capital de demostración</dt><dd>{usd(o.demoCapitalCents)}</dd>
            </dl>
          ) : <p className="muted">No hay emisión abierta.</p>}
        </div>
        <div className="card">
          <h2>Proyección de caja · 12 meses</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {o.cashProjection.map((m) => {
              const tot = m.interestCents + m.capitalCents;
              return (
                <div key={m.month} style={{ display: "grid", gridTemplateColumns: "56px 1fr 110px", gap: 8, alignItems: "center", fontSize: "0.85rem" }}>
                  <span className="muted">{monthLabel(m.month + "-01")}</span>
                  <span style={{ display: "flex", height: 10, background: "var(--bg)", borderRadius: 6, overflow: "hidden" }}>
                    <span style={{ width: `${(m.interestCents / maxCash) * 100}%`, background: "var(--green)" }} />
                    <span style={{ width: `${(m.capitalCents / maxCash) * 100}%`, background: "var(--navy)" }} />
                  </span>
                  <span className="num" style={{ textAlign: "right" }}>{tot ? usd(tot) : "—"}</span>
                </div>
              );
            })}
          </div>
          <div className="legend"><span><i className="dot green" /> Intereses a liquidar</span><span><i className="dot navy" /> Capital que vence</span></div>
          <p className="note" style={{ marginTop: 8 }}>
            Supuestos: sin aportes nuevos, sin reinversiones (que no salen de caja) y sin rescates anticipados; tasa vigente de cada posición.
            Capital sin vencimiento documentado ({usd(o.unscheduledCapitalCents)}) no se proyecta.
          </p>
        </div>
      </div>
      <div className="card section">
        <h2>Calendario de liquidaciones y vencimientos</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Titular</th><th>Posición</th><th className="r">Importe estimado</th></tr></thead>
            <tbody>
              {o.calendar.slice(0, 60).map((c, i) => (
                <tr key={i}>
                  <td>{formatDate(c.date)}</td>
                  <td>{c.kind === "liquidacion" ? "Liquidación" : "Vencimiento"}</td>
                  <td><Link href={`/?titular=${c.holderId}`}>{c.holderName}</Link> <DemoBadge show={c.isDemo} /></td>
                  <td>#{c.positionId}</td>
                  <td className={`r num ${c.kind === "liquidacion" ? "amount-interest" : "amount-capital"}`}>{usd(c.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
