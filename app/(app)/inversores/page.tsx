import { requireUser } from "@/lib/auth";
import { formatDate, today } from "@/lib/dates";
import { pct, usd } from "@/lib/money";
import { investorsView } from "@/lib/views";
import { DemoBadge, PageHead } from "@/components/ui";

export default async function InvestorsPage() {
  const user = await requireUser();
  const adminView = user.role === "admin";
  const v = investorsView(today(), { includeDemo: true, adminView });
  return (
    <>
      <PageHead title="Inversores" sub="Capital pendiente e intereses de cada titular, según lo que cada uno autorizó mostrar." />
      {adminView && <div className="alert info">Vista de administrador: ves a todos los titulares. Los agentes sólo ven a quienes dieron su consentimiento.</div>}
      <div className="card">
        <div className="legend" style={{ marginTop: 0, marginBottom: 8 }}>
          <span><i className="dot navy" /> Capital pendiente</span>
          <span><i className="dot green" /> Intereses acumulados pendientes de pago</span>
        </div>
        {v.rows.length === 0 && v.aggregated.count === 0 && <p className="muted">Todavía no hay inversores para mostrar.</p>}
        {v.rows.map((r) => (
          <details className="row" key={r.holderId}>
            <summary>
              <span>
                <strong>{r.displayName}</strong> <DemoBadge show={r.isDemo} />
                {r.kind === "prestamo" && <span className="badge">Préstamo preexistente</span>}
                <br /><small className="faint">Actualizado al {formatDate(r.updatedAt)}</small>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="amount-capital num">Capital {usd(r.capitalCents)}</span><br />
                <span className="amount-interest num">Intereses +{usd(r.pendingInterestCents)}</span>{" "}
                <span className="chev" aria-hidden>▾</span>
              </span>
            </summary>
            {!r.reconciled && <div className="alert warn">Pendiente de conciliación.</div>}
            <div className="table-wrap" style={{ paddingBottom: 12 }}>
              <table>
                <thead><tr><th>Fecha</th><th className="r">Capital original</th><th className="r">Capital pendiente</th><th className="r">Tasa</th><th className="r">Intereses generados</th><th className="r">Pagados</th><th className="r">Pendientes</th><th>Vencimiento</th></tr></thead>
                <tbody>
                  {r.positions.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.activationDate)}</td>
                      <td className="r num">{usd(p.principalCents)}</td>
                      <td className="r num amount-capital">{usd(p.outstandingCents)}</td>
                      <td className="r">{pct(p.rateBps)}</td>
                      <td className="r num">{usd(p.generatedCents)}</td>
                      <td className="r num">{usd(p.paidCents)}</td>
                      <td className="r num amount-interest">+{usd(p.pendingCents)}</td>
                      <td>{p.maturityDate ? formatDate(p.maturityDate) : <small className="faint">No documentado</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {v.aggregated.count >= 2 && (
          <div style={{ padding: "14px 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <span><strong>Otros inversores</strong><br /><small className="faint">{v.aggregated.count} titular{v.aggregated.count > 1 ? "es" : ""} · sólo datos agregados, por elección de cada titular</small></span>
            <span style={{ textAlign: "right" }}>
              <span className="amount-capital num">Capital {usd(v.aggregated.capitalCents)}</span><br />
              <span className="amount-interest num">Intereses +{usd(v.aggregated.pendingInterestCents)}</span>
            </span>
          </div>
        )}
      </div>
      <p className="note section">Los intereses se calculan con las condiciones y los pagos registrados. No se muestran rankings ni comparaciones entre personas, documentos privados ni datos bancarios.</p>
    </>
  );
}
