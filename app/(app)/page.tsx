import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { daysBetween, formatDate, formatDateLong, today } from "@/lib/dates";
import { holderMovements, portfolio } from "@/lib/ledger";
import { pct, usd } from "@/lib/money";
import { aporteDetails, chartData, currentM2PriceCents, simplePanel, whereData } from "@/lib/views";
import { InterestChart } from "@/components/InterestChart";
import { AporteList } from "@/components/AporteList";
import { LiveTicker, ReinvestNudge, Simulator } from "@/components/Fun";
import { CommissionCard, Explain, GoalCard, HowItWorks, Milestones, SnowballCard, WhereCard } from "@/components/Panel";
import { DemoBadge, Flash, StatusBadge } from "@/components/ui";

export default async function PanelPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, holder, viewingOther } = await resolveHolder(str(sp.titular));

  if (!holder) {
    // Usuario sin inversión: le explicamos cómo funciona y lo invitamos a simular.
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Hola, {user.name.split(" ")[0]}</h1>
            <p className="muted" style={{ margin: 0 }}>Todavía no invertiste en Renta Work. Mirá cuánto podrías ganar.</p>
          </div>
        </div>
        <div className="grid cols-2">
          <Simulator capitalCents={0} rateBps={1200} m2PriceCents={currentM2PriceCents()} ctaHref={null}
            ctaNote="Para empezar, pedile al administrador que habilite tu panel. Estimado al 12% anual pactado; no es una garantía de pago." />
          <SnowballCard capitalCents={100_000} rateBps={1200} />
        </div>
        <HowItWorks />
      </>
    );
  }

  const asOf = today();
  const s = simplePanel(holder.id, asOf);
  const pf = portfolio(holder.id, asOf);
  const chart = chartData(holder.id, asOf);
  const recent = holderMovements(holder.id).slice(0, 5);
  const aportes = aporteDetails(holder.id, asOf);
  const isToken = holder.kind === "token";
  const own = !viewingOther;
  const first = holder.name.split(" ")[0];
  const q = viewingOther ? `?titular=${holder.id}` : "";
  const where = whereData(s.capitalCents, { isToken, isDemo: !!holder.is_demo });
  const perDayExact = (s.capitalCents * s.rateBps) / 10_000 / 365;
  const firstDate = aportes.map((a) => a.date).sort()[0];
  const since = firstDate ? daysBetween(firstDate, asOf) : 0;
  const hasType = (t: string) => holderMovements(holder.id, { type: t, status: "completada" }).length > 0;
  const monthsPerToken = s.perMonthCents > 0 ? Math.ceil(10_000 / s.perMonthCents) : null;

  // Próximos cobros de todos los aportes, agrupados por fecha.
  const byDate = new Map<string, number>();
  for (const a of aportes) for (const c of a.schedule) if (!c.done) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.cents);
  const cobros = [...byDate.entries()].sort().slice(0, 6).map(([date, cents]) => ({ date, cents }));
  const next = cobros[0];

  const goalReached = !!holder.goal_kind && !!holder.goal_cents &&
    (holder.goal_kind === "ingreso" ? s.perMonthCents >= holder.goal_cents : s.capitalCents >= holder.goal_cents);
  const milestones = [
    { label: "Primera inversión activada", done: aportes.length > 0, hint: firstDate ? formatDate(firstDate) : "Cuando se confirme tu primer aporte" },
    { label: "Primer interés acreditado", done: hasType("liquidacion"), hint: hasType("liquidacion") ? "Ya cobraste intereses" : "A los 6 meses de tu primer aporte" },
    ...(isToken ? [{ label: "Primera reinversión", done: hasType("reinversion"), hint: hasType("reinversion") ? "Tus intereses ya generan" : "Cuando reinviertas intereses" }] : []),
    { label: "Meta alcanzada", done: goalReached, hint: holder.goal_kind ? "Tu meta personal" : "Elegí una meta" },
    { label: "1 año invirtiendo", done: since >= 365, hint: since >= 365 ? "¡Constancia!" : `Te faltan ${Math.max(0, 365 - since)} días` },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{own ? `Hola, ${first}` : holder.name} <DemoBadge show={holder.is_demo} /></h1>
          <p className="muted" style={{ margin: 0 }}>Entendé dónde invertís, seguí tu progreso y elegí tu próximo paso.</p>
        </div>
      </div>
      <Flash sp={sp} />

      {/* 1. Tu inversión */}
      <section className="hero-band" aria-label={own ? "Tu inversión" : "Su inversión"}>
        <div className="hb-top">
          <span className="hb-title">{own ? "Tu" : "Su"} inversión</span>
          <span className="hb-date">al {formatDateLong(asOf)}</span>
        </div>
        <div className="hb-grid">
          <div className="hb-main">
            <span className="hb-label">Capital invertido <Explain>La plata que {own ? "pusiste" : "puso"} y que está trabajando. {isToken && pf.balances.tokens > 0 ? `Son ${pf.balances.tokens} tokens de USD 100.` : ""}</Explain></span>
            <span className="hb-big num">{usd(s.capitalCents)}</span>
            {isToken && pf.balances.tokens > 0 && <span className="hb-sub">{pf.balances.tokens} tokens de USD 100</span>}
          </div>
          <div>
            <span className="hb-label">Intereses para usar <Explain>Ya se acreditaron. Los {own ? "podés" : "puede"} cobrar o reinvertir. Mientras no se usen, no generan más intereses.</Explain></span>
            <span className="hb-num num hb-green">{usd(s.availableCents)}</span>
          </div>
          <div>
            <span className="hb-label">Intereses en curso <Explain>Lo que la plata va generando día a día desde el último cobro. Es un estimado: se acredita en la próxima fecha de cobro.</Explain></span>
            <span className="hb-num num"><LiveTicker baseCents={pf.accruedCents} perDayCents={perDayExact} asOf={asOf} /></span>
            <span className="hb-sub">estimado · suma {usd(s.perDayCents)} por día</span>
          </div>
        </div>
        <div className="hb-foot">
          <span>Rendimiento acumulado: <strong className="hb-green">+ <LiveTicker baseCents={s.generatedCents} perDayCents={perDayExact} asOf={asOf} /></strong>{firstDate ? ` desde el ${formatDate(firstDate)}` : ""}.</span>
          {monthsPerToken && isToken && <span className="hb-sub">Genera {usd(s.perMonthCents)} por mes: cada {monthsPerToken} meses junta para un token nuevo.</span>}
        </div>
        {own && (
          <div className="hb-actions">
            {isToken && <Link className="btn solid-light" href="/invertir">Sumar inversión</Link>}
            <Link className="btn ghost-light" href="/intereses">Cobrar o reinvertir</Link>
            <Link className="btn ghost-light" href="/movimientos">Ver movimientos</Link>
          </div>
        )}
      </section>

      {own && isToken && s.availableCents >= 10_000 && (
        <div className="section"><ReinvestNudge availableCents={s.availableCents} rateBps={s.rateBps} href="/intereses" /></div>
      )}

      {/* 2. Próximo cobro + meta */}
      <div className="grid cols-2 section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>{own ? "Tu" : "Su"} próximo cobro</h2>
          {next ? (
            <>
              <div className="next-pay">
                <span className="num">{formatDate(next.date)}</span>
                <strong className="num amount-interest">≈ {usd(next.cents)}</strong>
              </div>
              <p className="muted" style={{ margin: "6px 0 0" }}>Ese día se acreditan los intereses de los últimos 6 meses. Después {own ? "elegís" : "elige"} si cobrarlos o reinvertirlos.</p>
              {cobros.length > 1 && (
                <details className="explain" style={{ marginTop: 10 }}>
                  <summary>Ver calendario de cobros</summary>
                  <ul className="list explain-body">
                    {cobros.map((c) => <li key={c.date}><span className="num">{formatDate(c.date)}</span><span className="num amount-interest">≈ {usd(c.cents)}</span></li>)}
                  </ul>
                </details>
              )}
            </>
          ) : <p className="muted">No hay cobros programados.</p>}
        </div>
        <GoalCard kind={holder.goal_kind} goalCents={holder.goal_cents} capitalCents={s.capitalCents} perMonthCents={s.perMonthCents} rateBps={s.rateBps} own={own} />
      </div>

      {/* 3. Dónde está tu plata */}
      {where && <div className="section"><WhereCard d={where} own={own} /></div>}

      {/* 4. Tu próximo paso */}
      <h2 className="section-title">Elegí tu próximo paso</h2>
      <div className="grid cols-2">
        <Simulator capitalCents={s.capitalCents} rateBps={s.rateBps} m2PriceCents={isToken ? currentM2PriceCents() : null} ctaHref={own && isToken ? "/invertir" : null}
          ctaNote={isToken ? undefined : "Estimado al 12% anual. Para sumar plata nueva, hablalo con el administrador. No es una garantía de pago."} />
        <SnowballCard capitalCents={s.capitalCents} rateBps={s.rateBps} />
      </div>
      {isToken && <div className="section"><CommissionCard pct={holder.commission_pct ?? 0} own={own} /></div>}

      <Milestones items={milestones} />

      {pf.pending.length > 0 && (
        <div className="alert info section">
          {pf.pending.length === 1 ? "Tenés una solicitud en curso" : `Tenés ${pf.pending.length} solicitudes en curso`}: {pf.pending.map((m) => m.description).join(" · ")}. No cambian tus saldos hasta que se confirman.
        </div>
      )}

      {/* 5. Evolución y movimientos */}
      <h2 className="section-title">{own ? "Tu" : "Su"} evolución</h2>
      <div className="card">
        <h3>Cómo crecen {own ? "tus" : "sus"} intereses</h3>
        <InterestChart data={chart} />
      </div>
      <div className="card section">
        <h3 style={{ marginBottom: 4 }}>{own ? "Tus" : "Sus"} aportes</h3>
        <p className="note" style={{ marginTop: 0 }}>Tocá cada fecha para ver el detalle y cuándo cobra intereses.</p>
        <AporteList items={aportes} />
      </div>
      <div className="card section">
        <div className="total-row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Últimos movimientos</h3>
          <Link href={`/movimientos${q}`} className="note">Ver todos</Link>
        </div>
        <ul className="list">
          {recent.map((m) => (
            <li key={m.id}>
              <span>{m.description}<br /><small>{formatDate(m.effective_date)}</small></span>
              <span style={{ textAlign: "right" }}>
                <span className={`num ${m.type === "liquidacion" ? "amount-interest" : ""}`}>{usd(m.amount_cents)}</span>
                {m.status !== "completada" && <><br /><StatusBadge status={m.status} /></>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <HowItWorks />

      <p className="note section">
        Cada aporte genera {pct(s.rateBps)} anual y cobra intereses cada 6 meses desde su fecha. Es una tasa pactada, no una garantía de pago.
        Los montos futuros son estimados y suponen que no se agrega ni se retira plata.
      </p>
    </>
  );
}
