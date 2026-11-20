import { requireUser } from "@/lib/auth";
import { formatDate, formatDateLong, today } from "@/lib/dates";
import { usd } from "@/lib/money";
import { aporteDetails, generalOverview } from "@/lib/views";
import { getHolderByUser } from "@/lib/ledger";
import { AporteList } from "@/components/AporteList";
import { InterestChart } from "@/components/InterestChart";
import { LiveTicker } from "@/components/Fun";

/** Solapa general: la inversión de todos. */
export default async function InversionPage() {
  const user = await requireUser();
  const me = getHolderByUser(user.id);
  const asOf = today();
  const g = generalOverview(asOf);
  const { rows, others, total } = g.list;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>La inversión de todos</h1>
          <p className="muted" style={{ margin: 0 }}>Cuánto hay trabajando en Renta Work y cuánto viene generando, al {formatDateLong(asOf)}.</p>
        </div>
      </div>

      <div className="card live">
        <div className="total-row" style={{ alignItems: "flex-start" }}>
          <div>
            <span className="muted"><span className="pulse" aria-hidden="true" />Entre todos ya generamos</span>
            <span className="big-live"><LiveTicker baseCents={g.generatedCents} perDayCents={g.perDayExact} asOf={asOf} /></span>
            <span className="muted">de intereses, y sigue sumando ahora mismo.</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="muted">Capital trabajando</span>
            <div className="num" style={{ fontSize: "1.9rem", fontWeight: 750 }}>{usd(g.capitalCents)}</div>
            <span className="muted">{g.investors} inversor{g.investors === 1 ? "" : "es"}</span>
          </div>
        </div>
        <div className="chips">
          <span className="chip"><strong>+{usd(g.perDayCents)}</strong> por día</span>
          <span className="chip"><strong>+{usd(g.perMonthCents)}</strong> por mes</span>
          <span className="chip"><strong>+{usd(g.perYearCents)}</strong> por año</span>
          <span className="chip">Tasa <strong>12% anual</strong></span>
        </div>
      </div>

      <div className="card section">
        <h2 style={{ marginBottom: 4 }}>Inversores</h2>
        <p className="note" style={{ marginTop: 0 }}>De mayor a menor según la plata que pusieron. Tocá un nombre para ver sus aportes.</p>
        {rows.length === 0 && !others ? <p className="muted" style={{ margin: 0 }}>Todavía no hay inversores.</p> : (
          <div>
            <div className="inv-grid inv-head"><span>Inversor</span><span>Puso</span><span>Intereses generados</span><span className="hide-sm">Genera por mes</span></div>
            {rows.map((r) => (
              <details className="row" key={r.holderId}>
                <summary className="inv-grid">
                  <span>{r.name}{me?.id === r.holderId && <span className="you">Vos</span>}</span>
                  <span className="num amount-capital">{usd(r.investedCents)}</span>
                  <span className="num amount-interest">+ {usd(r.generatedCents)}</span>
                  <span className="num hide-sm">{usd(r.perMonthCents)} <span className="chev" aria-hidden="true">▾</span></span>
                </summary>
                <div className="aporte-detail"><AporteList items={aporteDetails(r.holderId, asOf)} compact /></div>
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

      <div className="card section">
        <h2>Cómo crecen los intereses de todos</h2>
        <InterestChart data={g.chart} estimateLabel="Estimado si nadie agrega ni retira plata" />
      </div>

      <div className="card section">
        <h2>Próximos cobros de intereses</h2>
        <ul className="list">
          {g.upcoming.map((u, i) => (
            <li key={u.date} className={i === 0 ? "highlight" : ""}>
              <span><strong className="num">{formatDate(u.date)}</strong><br /><small>{u.names.join(" · ")}</small></span>
              <span className="num amount-interest">≈ {usd(u.cents)}</span>
            </li>
          ))}
        </ul>
        <p className="note" style={{ marginBottom: 0 }}>Cada aporte cobra intereses cada 6 meses desde su propia fecha.</p>
      </div>

      <p className="note section">Tasa pactada del 12% anual, no una garantía de pago. Los estimados suponen que nadie agrega ni retira plata.</p>
    </>
  );
}
