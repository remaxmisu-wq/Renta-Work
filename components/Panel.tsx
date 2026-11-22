// Piezas del panel individual, escritas para personas sin experiencia financiera.
import Link from "next/link";
import type { ReactNode } from "react";
import { commissionPctAction, goalAction } from "@/app/actions";
import { formatDate, type ISODate } from "@/lib/dates";
import { snowball } from "@/lib/engine";
import { COMMISSION_PCTS } from "@/lib/ledger";
import { num, usd } from "@/lib/money";
import { SubmitButton } from "./SubmitButton";

const round = (c: number) => usd(c).replace(/,00$/, "");

/** Botón "?" que despliega una explicación en palabras simples. */
export function Explain({ children, label = "¿Qué es?" }: { children: ReactNode; label?: string }) {
  return (
    <details className="explain">
      <summary aria-label={label}>{label}</summary>
      <div className="explain-body">{children}</div>
    </details>
  );
}

// ───────── Meta personal ─────────

export function GoalCard({ kind, goalCents, capitalCents, perMonthCents, rateBps, own }: {
  kind: "capital" | "ingreso" | null; goalCents: number | null; capitalCents: number; perMonthCents: number; rateBps: number; own: boolean;
}) {
  const form = (
    <form action={goalAction} className="form" style={{ gap: 10 }}>
      <div className="inline-form">
        <label>Quiero…
          <select name="kind" defaultValue={kind ?? "capital"}>
            <option value="capital">llegar a tener invertido</option>
            <option value="ingreso">que mi plata genere por mes</option>
          </select>
        </label>
        <label>Monto en USD<input name="amount" inputMode="decimal" placeholder={kind === "ingreso" ? "50" : "5000"} defaultValue={goalCents ? String(goalCents / 100) : ""} required /></label>
      </div>
      <SubmitButton className="btn primary">{kind ? "Cambiar meta" : "Elegir mi meta"}</SubmitButton>
    </form>
  );

  if (!kind || !goalCents) {
    return (
      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Tu meta</h2>
        <p className="muted" style={{ marginTop: 0 }}>Ponerte una meta ayuda a avanzar de a poco. Elegí una y te mostramos cuánto te falta y cómo llegar.</p>
        {own ? form : <p className="muted">Todavía no eligió una meta.</p>}
      </div>
    );
  }

  const rate = rateBps / 10_000;
  // Para una meta de ingreso, el capital necesario es: ingreso por mes × 12 ÷ tasa.
  const targetCapital = kind === "ingreso" ? Math.ceil((goalCents * 12) / rate / 10_000) * 10_000 : goalCents;
  const current = kind === "ingreso" ? perMonthCents : capitalCents;
  const progress = Math.min(1, current / goalCents);
  const missing = Math.max(0, targetCapital - capitalCents);
  const done = progress >= 1;
  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>{own ? "Tu" : "Su"} meta</h2>
      <p style={{ marginTop: 0, fontSize: "1.05rem" }}>
        {kind === "ingreso" ? <>Que la plata genere <strong>{round(goalCents)} por mes</strong></> : <>Llegar a <strong>{round(goalCents)} invertidos</strong></>}
      </p>
      <div className="goal-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.max(3, progress * 100)}%` }} />
      </div>
      <div className="total-row" style={{ marginTop: 6, fontSize: "0.9rem" }}>
        <span className="muted">{kind === "ingreso" ? `Hoy genera ${usd(current)} por mes` : `Hoy ${round(current)}`}</span>
        <strong>{Math.round(progress * 100)} %</strong>
      </div>
      {done ? (
        <p className="goal-done">¡Meta cumplida! Podés ponerte una nueva.</p>
      ) : (
        <>
          <p style={{ margin: "14px 0 6px" }}>
            {kind === "ingreso"
              ? <>Para eso hacen falta {round(targetCapital)} invertidos. Te faltan <strong>{round(missing)}</strong>.</>
              : <>Te faltan <strong>{round(missing)}</strong>.</>}
            {" "}¿En cuánto tiempo llegás?
          </p>
          <ul className="list goal-plan">
            {[100, 300, 500].map((m) => (
              <li key={m}><span>Sumando {round(m * 100)} por mes</span><strong>{Math.ceil(missing / (m * 100))} meses</strong></li>
            ))}
          </ul>
        </>
      )}
      {own && <details className="explain" style={{ marginTop: 8 }}><summary>Cambiar meta</summary><div className="explain-body">{form}</div></details>}
    </div>
  );
}

// ───────── La bola de nieve ─────────

export function SnowballCard({ capitalCents, rateBps }: { capitalCents: number; rateBps: number }) {
  const base = Math.max(capitalCents, 100_000);
  const pts = snowball(base, rateBps, 5);
  const last = pts[pts.length - 1];
  const W = 520, H = 190, P = { l: 8, r: 8, t: 26, b: 26 };
  const max = last.reinvestCents * 1.05;
  const min = base * 0.95;
  const x = (i: number) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - min) / (max - min)) * (H - P.t - P.b);
  const line = (k: "collectCents" | "reinvestCents") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const diff = last.reinvestCents - last.collectCents;
  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>La bola de nieve</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Cada 6 meses cobrás intereses. Podés llevártelos o reinvertirlos: si los reinvertís, esos intereses también empiezan a generar. Así se ve en 5 años con {round(base)}:
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="snow" role="img" aria-label={`En 5 años: cobrando ${round(last.collectCents)}, reinvirtiendo ${round(last.reinvestCents)}.`}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="var(--line)" />
        <path d={line("collectCents")} fill="none" stroke="var(--navy)" strokeWidth="2.5" />
        <path d={line("reinvestCents")} fill="none" stroke="var(--green)" strokeWidth="3" />
        <circle cx={x(pts.length - 1)} cy={y(last.reinvestCents)} r="5" fill="var(--green)" />
        <circle cx={x(pts.length - 1)} cy={y(last.collectCents)} r="4" fill="var(--navy)" />
        <text x={x(0)} y={H - 8} fontSize="12" fill="var(--faint)">Hoy</text>
        <text x={W - P.r} y={H - 8} fontSize="12" fill="var(--faint)" textAnchor="end">En 5 años</text>
      </svg>
      <div className="snow-legend">
        <div><span className="dot green" /> Si reinvertís siempre<strong className="num amount-interest">{round(last.reinvestCents)}</strong></div>
        <div><span className="dot navy" /> Si cobrás siempre<strong className="num">{round(last.collectCents)}</strong></div>
      </div>
      <p style={{ marginBottom: 0 }}>Reinvirtiendo, en 5 años tenés <strong className="amount-interest">{round(diff)} más</strong>, sin poner un peso nuevo.</p>
      <p className="note" style={{ marginBottom: 0 }}>Ejemplo estimado al 12 % anual pactado, reinvirtiendo en tokens enteros de USD 100. No es una garantía.</p>
    </div>
  );
}

// ───────── Una parte de cada comisión ─────────

export function CommissionCard({ pct, own }: { pct: number; own: boolean }) {
  const example = 200_000; // comisión de USD 2.000
  const ex = pct || 10;
  const exTokens = Math.floor((example * ex) / 100 / 10_000);
  return (
    <div className="card">
      <h2 style={{ marginBottom: 4 }}>Invertí una parte de cada comisión</h2>
      <p className="muted" style={{ marginTop: 0 }}>Elegís un porcentaje una sola vez. Cada vez que cobres una comisión en dólares, esa parte se invierte sola y el resto lo cobrás como siempre.</p>
      <div className="example">
        Ejemplo: cobrás una comisión de <strong>USD 2.000</strong> con el {ex} % → se invierten <strong>{round(exTokens * 10_000)}</strong> ({exTokens} tokens) y cobrás <strong>{round(example - exTokens * 10_000)}</strong>.
      </div>
      <p style={{ margin: "12px 0 8px" }}>Estado: <strong>{pct ? `activado, ${pct} % de cada comisión` : "desactivado"}</strong></p>
      {own && (
        <form action={commissionPctAction} className="inline-form">
          <label>Porcentaje
            <select name="pct" defaultValue={pct}>
              {COMMISSION_PCTS.map((p) => <option key={p} value={p}>{p ? `${p} %` : "No invertir automáticamente"}</option>)}
            </select>
          </label>
          <SubmitButton className="btn primary">Guardar</SubmitButton>
        </form>
      )}
      <p className="note" style={{ marginBottom: 0 }}>Solo con comisiones en dólares ya disponibles. Cada inversión queda como solicitud hasta que se confirma.</p>
    </div>
  );
}

// ───────── Dónde está tu plata ─────────

export interface WhereData {
  projectName: string; unit: string; typology: string; address: string; developer: string; surfaceM2: number;
  imageUrl: string | null; issuer: string | null; m2: number | null; share: number | null;
  updates: { date: ISODate; title: string; body: string | null; image: string | null }[];
}

function BuildingIllustration() {
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="Ilustración de un edificio" className="where-illus">
      <rect width="320" height="180" fill="var(--navy-soft)" />
      <rect x="0" y="150" width="320" height="30" fill="var(--line)" />
      <rect x="96" y="34" width="128" height="116" rx="4" fill="var(--surface)" stroke="var(--navy)" strokeWidth="2" />
      {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => (
        <rect key={`${r}-${c}`} x={112 + c * 36} y={48 + r * 24} width="24" height="14" rx="2" fill={r === 1 && c === 1 ? "var(--green)" : "var(--navy-soft)"} />
      )))}
      <rect x="148" y="128" width="24" height="22" rx="2" fill="var(--navy)" />
    </svg>
  );
}

export function WhereCard({ d, own }: { d: WhereData; own: boolean }) {
  return (
    <div className="card where">
      <div className="where-media">
        {d.imageUrl ? <img src={d.imageUrl} alt={`${d.projectName}, unidad ${d.unit}`} /> : <BuildingIllustration />}
        {!d.imageUrl && <small className="note">Imagen ilustrativa. Las fotos reales de la obra las publica la desarrolladora.</small>}
      </div>
      <div className="where-info">
        <h2 style={{ marginBottom: 2 }}>Dónde está {own ? "tu" : "su"} plata</h2>
        <p className="muted" style={{ marginTop: 0 }}>Financia la construcción de este proyecto.</p>
        <dl className="kv" style={{ fontSize: "0.95rem" }}>
          <dt>Proyecto</dt><dd>{d.projectName} · {d.unit}</dd>
          <dt>Dónde queda</dt><dd>{d.address}</dd>
          <dt>Quién lo construye</dt><dd>{d.developer}</dd>
          <dt>Quién responde por tu inversión</dt><dd>{d.issuer || <span className="pending">A definir por contrato</span>}</dd>
        </dl>
        {d.m2 !== null && d.share !== null && (
          <div className="m2line">
            <div className="total-row" style={{ fontSize: "0.93rem" }}>
              <span>Equivalencia orientativa: <strong>{num(d.m2, 2)} m²</strong> de {num(d.surfaceM2, 2)} m²</span>
              <span className="muted">{num(d.share * 100, 2)} %</span>
            </div>
            <div className="goal-bar thin"><div style={{ width: `${Math.max(1.5, d.share * 100)}%` }} /></div>
            <Explain label="¿Qué significa?">
              Es una forma de imaginar tu inversión: tu capital dividido por el valor de referencia del m². No son metros de tu propiedad, y si el departamento se valoriza tu inversión no cambia: rinde el 12 % anual pactado.
            </Explain>
          </div>
        )}
        <div className="actions" style={{ marginTop: 12 }}>
          {own && <Link className="btn small" href="/documentos">Ver contrato y comprobantes</Link>}
        </div>
        <h3 style={{ marginTop: 16 }}>Novedades de la obra</h3>
        {d.updates.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay novedades publicadas. Cuando la desarrolladora suba avances, los vas a ver acá.</p>
        ) : (
          <ul className="list">
            {d.updates.map((u, i) => (
              <li key={i}><span><strong>{u.title}</strong>{u.body && <><br /><small>{u.body}</small></>}</span><small>{formatDate(u.date)}</small></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ───────── Hitos ─────────

export function Milestones({ items }: { items: { label: string; done: boolean; hint: string }[] }) {
  return (
    <div className="card section">
      <div className="total-row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Tus hitos</h2>
        <span className="muted num">{items.filter((i) => i.done).length} de {items.length}</span>
      </div>
      <ol className="milestones">
        {items.map((m) => (
          <li key={m.label} className={m.done ? "on" : ""}>
            <span className="ms-dot" aria-hidden="true">{m.done ? "✓" : ""}</span>
            <span><strong>{m.label}</strong><small>{m.hint}</small></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────── Cómo funciona ─────────

export function HowItWorks() {
  return (
    <details className="card section how">
      <summary><h2 style={{ display: "inline", margin: 0 }}>¿Cómo funciona? Entendelo en 1 minuto</h2></summary>
      <ol className="how-steps">
        <li><strong>Ponés plata en tokens.</strong> Cada token vale USD 100. Podés usar una transferencia o parte de una comisión en dólares.</li>
        <li><strong>Tu plata genera intereses todos los días.</strong> Al 12 % anual: por cada USD 100, unos USD 1 por mes.</li>
        <li><strong>Cada 6 meses se acreditan.</strong> Contando desde la fecha de cada aporte. Ahí pasan a "intereses para usar".</li>
        <li><strong>Elegís qué hacer.</strong> Los cobrás, o los reinvertís para que también generen intereses.</li>
      </ol>
      <h3>Palabras que vas a ver</h3>
      <dl className="glossary">
        <dt>Capital</dt><dd>La plata que pusiste y que está trabajando.</dd>
        <dt>Intereses en curso</dt><dd>Lo que tu plata va generando día a día. Todavía no se puede usar: es un estimado hasta el próximo cobro.</dd>
        <dt>Intereses para usar</dt><dd>Lo que ya se acreditó. Lo podés cobrar o reinvertir.</dd>
        <dt>Reinvertir</dt><dd>Convertir tus intereses en tokens nuevos para que también generen.</dd>
        <dt>Solicitud</dt><dd>Un pedido (invertir, cobrar, rescatar). No cambia tus saldos hasta que se confirma.</dd>
        <dt>Vencimiento</dt><dd>La fecha en que se devuelve el capital, según el contrato.</dd>
      </dl>
    </details>
  );
}
