import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { formatDate, formatDateLong, today } from "@/lib/dates";
import { nextTokenProgress, theoreticalEffectiveAnnual } from "@/lib/engine";
import { MOVEMENT_LABELS, portfolio } from "@/lib/ledger";
import { num, pct, usd } from "@/lib/money";
import { chartData, daysUntil, personalXirr } from "@/lib/views";
import { PortfolioChart } from "@/components/PortfolioChart";
import { DemoBadge, Flash, PageHead, Stat, StatusBadge } from "@/components/ui";

export default async function PortfolioPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, holder, viewingOther } = await resolveHolder(str(sp.titular));
  if (!holder) {
    return (
      <>
        <PageHead title="Mi portfolio" />
        <div className="card empty">
          <h2>Todavía no tenés un portfolio Renta Work</h2>
          <p>Cuando el administrador habilite tu cuenta vas a ver acá tu capital, tus tokens y tus intereses.</p>
          {user.role === "admin" && <Link className="btn" href="/admin">Ir a administración</Link>}
        </div>
      </>
    );
  }

  const asOf = today();
  const pf = portfolio(holder.id, asOf);
  const chart = chartData(holder.id, asOf);
  const irr = personalXirr(holder.id, asOf);
  const progress = nextTokenProgress(pf.freeAvailableCents);
  const isToken = holder.kind === "token";
  const active = pf.positions.filter((p) => p.status === "activa" && p.nextSettlement);
  const upcoming = [...active].sort((a, b) => (a.nextSettlement! < b.nextSettlement! ? -1 : 1));
  const closest = upcoming[0];
  const maturities = new Map<string, { cents: number; termStatus: string | null }>();
  for (const p of pf.positions.filter((p) => p.status === "activa" && p.maturity_date)) {
    const m = maturities.get(p.maturity_date!) ?? { cents: 0, termStatus: p.emissionTermStatus };
    m.cents += p.outstanding_cents;
    maturities.set(p.maturity_date!, m);
  }
  const noMaturity = pf.positions.filter((p) => p.status === "activa" && !p.maturity_date).reduce((a, p) => a + p.outstanding_cents, 0);
  const rate = pf.positions.find((p) => p.status === "activa")?.rate_bps ?? 1200;

  return (
    <>
      <PageHead
        title={viewingOther ? `Portfolio de ${holder.name}` : "Mi portfolio"}
        sub={<>Actualizado al {formatDateLong(asOf)} <DemoBadge show={holder.is_demo} /></>}
      />
      <Flash sp={sp} />
      {!pf.reconciled && (
        <div className="alert warn">Pendiente de conciliación: el capital de las posiciones no coincide con los movimientos. El administrador fue notificado.</div>
      )}

      <div className="card hero">
        <div className="label">Total de mi cartera</div>
        <div className="big num">{usd(pf.totalCents)}</div>
        <div className="sub">Capital activo + intereses en curso + intereses disponibles. Lo que ya cobraste o reinvertiste no se vuelve a sumar.</div>
      </div>

      <div className="grid stats section" style={{ marginTop: 12 }}>
        <Stat label="Capital invertido" tone="capital" dot="navy" value={usd(pf.balances.capitalCents)} hint="Aportes y reinversiones, menos devoluciones." />
        {isToken && <Stat label="Mis tokens" value={num(pf.balances.tokens)} hint="Cada Token RW = USD 100 invertidos." />}
        <Stat label="Intereses en curso" tone="interest" dot="lightgreen" value={usd(pf.accruedCents)} hint="Se generan día a día. Se pueden usar cuando se liquidan." />
        <Stat label="Intereses disponibles" tone="interest" dot="green" value={usd(pf.balances.availableCents)} hint="Ya liquidados: podés cobrarlos o reinvertirlos. No generan interés." />
      </div>

      {!viewingOther && (
        <div className="actions section" style={{ marginTop: 16 }}>
          {isToken && <Link className="btn primary" href="/invertir">Invertir</Link>}
          {isToken && <Link className="btn green" href="/reinvertir">Reinvertir intereses</Link>}
          <Link className="btn" href="/cobrar">Solicitar cobro de intereses</Link>
          {isToken && <Link className="btn" href="/rescatar">Solicitar rescate</Link>}
          <Link className="btn" href="/movimientos">Ver movimientos</Link>
          <Link className="btn" href="/documentos">Ver mis documentos</Link>
        </div>
      )}

      {pf.pending.length > 0 && (
        <div className="card section">
          <h2>Solicitudes en curso</h2>
          <ul className="list">
            {pf.pending.map((m) => (
              <li key={m.id}>
                <span>{m.description}<br /><small>{MOVEMENT_LABELS[m.type]} · {formatDate(m.effective_date)}</small></span>
                <span style={{ textAlign: "right" }}><span className="num">{usd(m.amount_cents)}</span><br /><StatusBadge status={m.status} /></span>
              </li>
            ))}
          </ul>
          <p className="note">Una solicitud no es una operación ejecutada ni un pago realizado. No cambia tus saldos hasta completarse.</p>
        </div>
      )}

      {isToken && (
        <div className="card section">
          <h2>Próximo token</h2>
          <p className="num" style={{ fontSize: "1.05rem" }}>
            <strong>{usd(progress.towardNextCents)}</strong> de USD 100. Te faltan <strong>{usd(progress.missingCents)}</strong>.
          </p>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${Math.max(2, progress.ratio * 100)}%` }} />
          </div>
          {progress.fullTokens > 0 && (
            <p style={{ marginTop: 12 }}>
              Además, con tus intereses disponibles podés reinvertir <strong>{progress.fullTokens} token{progress.fullTokens > 1 ? "s" : ""}</strong> ahora.{" "}
              {!viewingOther && <Link href="/reinvertir">Reinvertir</Link>}
            </p>
          )}
          <p className="note">Sólo se reinvierten tokens enteros de USD 100. Lo que sobra queda disponible y se suma a la próxima liquidación.</p>
        </div>
      )}

      <div className="card section">
        <h2>Evolución de mi cartera</h2>
        <PortfolioChart data={chart} />
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>Próximas liquidaciones</h2>
          {upcoming.length === 0 ? <p className="muted">No hay liquidaciones programadas.</p> : (
            <ul className="list">
              {upcoming.map((p) => (
                <li key={p.id} className={p.id === closest?.id ? "highlight" : ""}>
                  <span>
                    <strong>{formatDate(p.nextSettlement)}</strong>
                    {p.id === closest?.id && <> · <small>la más cercana, en {daysUntil(p.nextSettlement!, asOf)} días</small></>}
                    <br />
                    <small>Posición del {formatDate(p.activation_date)} · {usd(p.outstanding_cents)}</small>
                  </span>
                  <span className="num amount-interest" title="Interés en curso de esta posición">+{usd(p.accruedCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="note">Cada aporte o reinversión liquida cada 6 meses desde su propia fecha de activación.</p>
        </div>
        <div className="card">
          <h2>Próximos vencimientos</h2>
          {maturities.size === 0 && noMaturity === 0 ? <p className="muted">Sin vencimientos.</p> : (
            <ul className="list">
              {[...maturities.entries()].sort().map(([d, m]) => (
                <li key={d}>
                  <span><strong>{formatDate(d)}</strong>{m.termStatus === "propuesta" && <><br /><small>Plazo propuesto, pendiente de confirmación</small></>}</span>
                  <span className="num amount-capital">{usd(m.cents)}</span>
                </li>
              ))}
              {noMaturity > 0 && (
                <li><span><strong>Sin fecha documentada</strong><br /><small>Pendiente de definición contractual</small></span><span className="num amount-capital">{usd(noMaturity)}</span></li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <h2>Información complementaria</h2>
          <dl className="kv">
            <dt>Aportes originales acumulados</dt><dd>{usd(pf.originalContributionsCents)}</dd>
            <dt>Intereses totales generados</dt><dd>{usd(pf.interestGeneratedCents)}</dd>
            <dt>Intereses cobrados</dt><dd>{usd(pf.interestCollectedCents)}</dd>
            <dt>Intereses reinvertidos</dt><dd>{usd(pf.interestReinvestedCents)}</dd>
            <dt>Tasa aplicable</dt><dd>{pct(rate)} anual</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Tasas y rendimiento</h2>
          <dl className="kv">
            <dt>TNA (tasa nominal anual)</dt><dd>{pct(rate)}</dd>
            <dt>TEA teórica</dt><dd>{(theoreticalEffectiveAnnual(rate) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%</dd>
            <dt>Mi rentabilidad anualizada</dt><dd>{irr === null ? "Todavía no disponible" : `${(irr * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`}</dd>
          </dl>
          <p className="note" style={{ marginTop: 12 }}>
            La TEA teórica es sólo la referencia de reinvertir todo cada seis meses al 6% por período. No es una promesa de resultado.
            Tu resultado depende de las fechas y de las reinversiones. Solo se reinvierten tokens enteros de USD 100.
          </p>
          <p className="note">La rentabilidad anualizada se calcula con tus aportes, cobros y el valor de hoy (XIRR). Las reinversiones no cuentan como aportes.</p>
        </div>
      </div>

      <div className="card section">
        <h2>Mis posiciones</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Activación</th><th>Origen</th>{isToken && <th className="r">Tokens</th>}<th className="r">Capital</th><th className="r">Tasa</th><th className="r">En curso</th><th>Próx. liquidación</th><th>Vencimiento</th></tr></thead>
            <tbody>
              {pf.positions.filter((p) => p.status !== "cancelada").map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.activation_date)}</td>
                  <td>{{ aporte: "Aporte", comision: "Comisión", reinversion: "Reinversión", saldo_importado: "Saldo importado" }[p.origin]}</td>
                  {isToken && <td className="r num">{p.tokens}</td>}
                  <td className="r num">{usd(p.outstanding_cents)}</td>
                  <td className="r">{pct(p.rate_bps)}</td>
                  <td className="r num amount-interest">{usd(p.accruedCents)}</td>
                  <td>{p.status === "vencida" ? "Vencida" : formatDate(p.nextSettlement)}</td>
                  <td>{p.maturity_date ? <>{formatDate(p.maturity_date)}{p.emissionTermStatus === "propuesta" && <small className="faint"> (propuesta)</small>}</> : <small className="faint">Pendiente</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
