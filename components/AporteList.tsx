import { formatDate } from "@/lib/dates";
import { num, pct, usd } from "@/lib/money";
import type { AporteDetail } from "@/lib/views";

const ORIGIN: Record<AporteDetail["origin"], string> = {
  aporte: "Aporte",
  comision: "Aporte desde comisión",
  reinversion: "Reinversión de intereses",
  saldo_importado: "Aporte",
};

/** Lista de aportes por fecha. Cada fila se despliega con el detalle y el calendario de cobros. */
export function AporteList({ items, compact = false }: { items: AporteDetail[]; compact?: boolean }) {
  if (!items.length) return <p className="muted" style={{ margin: 0 }}>Todavía no hay aportes.</p>;
  return (
    <div>
      {items.map((a) => (
        <details className="row" key={a.id}>
          <summary>
            <span>
              <strong className="num">{formatDate(a.date)}</strong>
              <span className="muted"> · {ORIGIN[a.origin]}</span>
              <br />
              <span className="num amount-capital">{usd(a.amountCents)}</span>
            </span>
            <span style={{ textAlign: "right" }}>
              <span className="num amount-interest">+ {usd(a.generatedCents)}</span>
              {!compact && <><br /><small>generados</small></>}{" "}
              <span className="chev" aria-hidden="true">▾</span>
            </span>
          </summary>
          <div className="aporte-detail">
            <dl className="kv">
              <dt>Fecha en que se puso la plata</dt><dd>{formatDate(a.date)}</dd>
              <dt>Monto</dt><dd>{usd(a.amountCents)}</dd>
              {a.originalCents !== a.amountCents && (<><dt>Monto original</dt><dd>{usd(a.originalCents)}</dd></>)}
              <dt>Tasa</dt><dd>{pct(a.rateBps)} anual</dd>
              <dt>Días invertidos</dt><dd>{num(a.days)}</dd>
              <dt>Intereses generados hasta hoy</dt><dd className="amount-interest">+ {usd(a.generatedCents)}</dd>
              <dt>Genera por mes</dt><dd>{usd(a.perMonthCents)}</dd>
              <dt>Vence</dt><dd>{a.maturity ? formatDate(a.maturity) : "A definir"}</dd>
            </dl>
            {a.schedule.length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>Cobros de intereses (cada 6 meses desde la fecha del aporte)</h3>
                <ul className="list">
                  {a.schedule.map((s) => (
                    <li key={s.date}>
                      <span className="num">{formatDate(s.date)} <small>{s.done ? "· liquidado" : "· estimado"}</small></span>
                      <span className="num amount-interest">{s.done ? "" : "≈ "}{usd(s.cents)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
