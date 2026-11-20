import { requireUser } from "@/lib/auth";
import { formatDateLong, today } from "@/lib/dates";
import { usd } from "@/lib/money";
import { aporteDetails, investorList } from "@/lib/views";
import { AporteList } from "@/components/AporteList";
import { DemoBadge } from "@/components/ui";

export default async function InvestorsPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const asOf = today();
  const { rows, others, total } = investorList(asOf, { adminView: admin, includeDemo: false });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inversores</h1>
          <p className="muted" style={{ margin: 0 }}>Cuánto puso cada uno y cuánto le vienen generando sus intereses, al {formatDateLong(asOf)}. Tocá un nombre para ver sus aportes.</p>
        </div>
      </div>
      <div className="card">
        {rows.length === 0 && !others ? <p className="muted" style={{ margin: 0 }}>Todavía no hay inversores para mostrar.</p> : (
          <div>
            <div className="inv-grid inv-head"><span>Inversor</span><span>Puso</span><span>Intereses generados</span><span className="hide-sm">Genera por mes</span></div>
            {rows.map((r) => (
              <details className="row" key={r.holderId}>
                <summary className="inv-grid">
                  <span>{r.name} <DemoBadge show={r.isDemo} /></span>
                  <span className="num amount-capital">{usd(r.investedCents)}</span>
                  <span className="num amount-interest">+ {usd(r.generatedCents)}</span>
                  <span className="num hide-sm">{usd(r.perMonthCents)} <span className="chev" aria-hidden="true">▾</span></span>
                </summary>
                <div className="aporte-detail">
                  <AporteList items={aporteDetails(r.holderId, asOf)} compact />
                </div>
              </details>
            ))}
            {others && (
              <div className="inv-grid inv-row">
                <span>Otros {others.count} inversores</span>
                <span className="num amount-capital">{usd(others.investedCents)}</span>
                <span className="num amount-interest">+ {usd(others.generatedCents)}</span>
                <span className="num hide-sm">{usd(others.perMonthCents)}</span>
              </div>
            )}
            <div className="inv-grid inv-row inv-total">
              <strong>Total</strong>
              <strong className="num">{usd(total.investedCents)}</strong>
              <span className="num amount-interest">+ {usd(total.generatedCents)}</span>
              <strong className="num hide-sm">{usd(total.perMonthCents)}</strong>
            </div>
          </div>
        )}
      </div>
      <p className="note section">
        {admin
          ? "Como administrador ves a todos. Los demás usuarios ven sólo a quienes autorizaron aparecer en esta lista (se marca en Administrar → Titulares)."
          : "Sólo aparecen quienes autorizaron mostrar sus datos."}{" "}
        Los intereses se calculan al 12% anual sobre el capital de cada uno.
      </p>
    </>
  );
}
