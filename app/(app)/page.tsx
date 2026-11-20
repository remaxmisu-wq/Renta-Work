import Link from "next/link";
import { resolveHolder, str, type SP } from "@/lib/session";
import { daysBetween, formatDate, formatDateLong, today } from "@/lib/dates";
import { holderMovements, portfolio } from "@/lib/ledger";
import { pct, usd } from "@/lib/money";
import { aporteDetails, chartData, deptoEquivalence, simplePanel } from "@/lib/views";
import { getDb } from "@/lib/db";
import { InterestChart } from "@/components/InterestChart";
import { DeptoCard } from "@/components/DeptoCard";
import { AporteList } from "@/components/AporteList";
import { Achievements, LiveTicker, ReinvestNudge, Simulator, type Badge } from "@/components/Fun";
import { DemoBadge, Flash, StatusBadge } from "@/components/ui";

function currentM2Price(): number | null {
  const r = getDb().prepare("SELECT price_cents FROM m2_prices ORDER BY effective_date DESC, id DESC LIMIT 1").get() as { price_cents: number } | undefined;
  return r?.price_cents ?? null;
}

export default async function PanelPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, holder, viewingOther } = await resolveHolder(str(sp.titular));

  if (!holder) {
    // Usuario sin inversión: lo invitamos a simular.
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Hola, {user.name.split(" ")[0]}</h1>
            <p className="muted" style={{ margin: 0 }}>Todavía no invertiste en Renta Work. Mirá cuánto podrías ganar.</p>
          </div>
        </div>
        <div className="grid cols-2">
          <Simulator capitalCents={0} rateBps={1200} m2PriceCents={currentM2Price()} ctaHref={null}
            ctaNote="Para empezar, pedile al administrador que habilite tu panel. Estimado al 12% anual pactado; no es una garantía de pago." />
          <div className="card">
            <h2>Cómo funciona</h2>
            <ol style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 10 }}>
              <li>Comprás tokens de <strong>USD 100</strong> cada uno, también con parte de tus comisiones en dólares.</li>
              <li>Tu plata genera <strong>12% anual</strong>, todos los días.</li>
              <li>Cada 6 meses cobrás los intereses o los reinvertís para que generen más.</li>
            </ol>
          </div>
        </div>
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
  // Los préstamos preexistentes no se atribuyen a la unidad K01.
  const depto = isToken && s.capitalCents > 0 ? deptoEquivalence(s.capitalCents) : null;
  const first = holder.name.split(" ")[0];
  const next = s.upcoming[0];
  const q = viewingOther ? `?titular=${holder.id}` : "";
  const own = !viewingOther;
  const perDayExact = (s.capitalCents * s.rateBps) / 10_000 / 365;
  const firstDate = aportes.map((a) => a.date).sort()[0];
  const hasType = (t: string) => holderMovements(holder.id, { type: t, status: "completada" }).length > 0;
  const m2 = depto?.m2 ?? 0;
  // Próximos cobros de todos los aportes, agrupados por fecha.
  const byDate = new Map<string, number>();
  for (const a of aportes) for (const c of a.schedule) if (!c.done) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.cents);
  const cobros = [...byDate.entries()].sort().slice(0, 5).map(([date, cents]) => ({ date, cents }));

  const badges: Badge[] = isToken ? [
    { label: "Primer aporte", done: aportes.length > 0, hint: firstDate ? formatDate(firstDate) : "Comprá tu primer token" },
    { label: "Primer cobro", done: hasType("liquidacion"), hint: hasType("liquidacion") ? "Ya liquidaste intereses" : "A los 6 meses del aporte" },
    { label: "Primera reinversión", done: hasType("reinversion"), hint: hasType("reinversion") ? "Tus intereses ya generan" : "Reinvertí tus intereses" },
    { label: "1 m² del depto", done: m2 >= 1, hint: "Con USD 1.000 invertidos" },
    { label: "1 año invirtiendo", done: !!firstDate && daysBetween(firstDate, asOf) >= 365, hint: "Desde tu primer aporte" },
    { label: "5 m² del depto", done: m2 >= 5, hint: "Con USD 5.000 invertidos" },
  ] : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{own ? `Hola, ${first}` : holder.name} <DemoBadge show={holder.is_demo} /></h1>
          <p className="muted" style={{ margin: 0 }}>Así está {own ? "tu" : "su"} inversión al {formatDateLong(asOf)}.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className="card live">
        <div className="total-row" style={{ alignItems: "flex-start" }}>
          <div>
            <span className="muted"><span className="pulse" aria-hidden="true" />{own ? "Tu" : "Su"} plata ya generó</span>
            <span className="big-live"><LiveTicker baseCents={s.generatedCents} perDayCents={perDayExact} asOf={asOf} /></span>
            <span className="muted">de intereses, y sigue sumando ahora mismo.</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="muted">Hoy {own ? "tenés" : "tiene"}</span>
            <div className="num" style={{ fontSize: "1.9rem", fontWeight: 750 }}>{usd(s.todayCents)}</div>
            <span className="muted num">Pus{own ? "iste" : "o"} {usd(s.investedCents)}{isToken && pf.balances.tokens > 0 ? ` · ${pf.balances.tokens} tokens` : ""}</span>
          </div>
        </div>
        <div className="chips">
          <span className="chip"><strong>+{usd(s.perDayCents)}</strong> por día</span>
          <span className="chip"><strong>+{usd(s.perMonthCents)}</strong> por mes</span>
          <span className="chip"><strong>+{usd(s.perMonthCents * 12)}</strong> por año</span>
          {next && <span className="chip">Próximo cobro <strong>{formatDate(next.date)}</strong> ≈ {usd(next.cents)}</span>}
        </div>
      </div>

      {own && isToken && s.availableCents >= 10_000 && (
        <div className="section"><ReinvestNudge availableCents={s.availableCents} rateBps={s.rateBps} href="/reinvertir" /></div>
      )}

      <div className="grid cols-2 section">
        {isToken && <Simulator capitalCents={s.capitalCents} rateBps={s.rateBps} m2PriceCents={currentM2Price()} ctaHref={own ? "/invertir" : null} />}
        <div className="card">
          <h2>Próximos cobros de intereses</h2>
          <ul className="list">
            {cobros.map((u, i) => (
              <li key={u.date} className={i === 0 ? "highlight" : ""}>
                <span><strong className="num">{formatDate(u.date)}</strong>{i === 0 && <small> · el más cercano</small>}</span>
                <span className="num amount-interest">≈ {usd(u.cents)}</span>
              </li>
            ))}
          </ul>
          <p className="note" style={{ marginBottom: 0 }}>Cada aporte cobra intereses cada 6 meses desde su fecha.</p>
        </div>
      </div>

      <div className="card section">
        <h2>Cómo crecen {own ? "tus" : "sus"} intereses</h2>
        <InterestChart data={chart} />
      </div>

      {depto && <DeptoCard d={depto} own={own} />}

      {badges.length > 0 && <Achievements items={badges} />}

      {own && s.availableCents > 0 && s.availableCents < 10_000 && (
        <div className="card section">
          <div className="total-row">
            <span><strong>Tenés {usd(s.availableCents)} de intereses para usar</strong><br /><small>Cuando sumes USD 100 los podés reinvertir; mientras tanto, los podés cobrar.</small></span>
            <Link className="btn" href="/cobrar">Cobrar</Link>
          </div>
        </div>
      )}

      {pf.pending.length > 0 && (
        <div className="alert info section">
          {pf.pending.length === 1 ? "Tenés una solicitud en curso" : `Tenés ${pf.pending.length} solicitudes en curso`}: {pf.pending.map((m) => m.description).join(" · ")}. No cambian tus saldos hasta completarse.
        </div>
      )}

      <div className="card section">
        <h2 style={{ marginBottom: 4 }}>{own ? "Tus" : "Sus"} aportes</h2>
        <p className="note" style={{ marginTop: 0 }}>Tocá cada fecha para ver el detalle y cuándo cobra intereses.</p>
        <AporteList items={aportes} />
      </div>

      <div className="card section">
        <div className="total-row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Últimos movimientos</h2>
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

      <p className="note section">
        Cada aporte genera {pct(s.rateBps)} anual y cobra intereses cada 6 meses desde su fecha. Es una tasa pactada, no una garantía de pago.
        Los estimados suponen que no se agrega ni se retira plata.
      </p>
    </>
  );
}
