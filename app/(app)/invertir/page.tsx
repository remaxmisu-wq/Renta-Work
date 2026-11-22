import { commissionSplitAction, investAction } from "@/app/actions";
import { resolveHolder, type SP } from "@/lib/session";
import { formatDate, addMonths, today } from "@/lib/dates";
import { availableCommissions, capUsage, commissionFreeCents, currentEmission, ledgerBalances } from "@/lib/ledger";
import { currentM2PriceCents } from "@/lib/views";
import { getDb } from "@/lib/db";
import { Simulator } from "@/components/Fun";
import { pct, usd, TOKEN_CENTS } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";
import { TokensField } from "@/components/TokensField";
import { Flash, IdemKey, PageHead } from "@/components/ui";

export default async function InvestPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, holder } = await resolveHolder();
  const e = currentEmission(!!holder?.is_demo);
  const cap = e ? capUsage(e.id) : null;
  const commissions = availableCommissions(user.id);
  const maxByCap = cap?.remainingCents == null ? 0 : Math.floor(cap.remainingCents / TOKEN_CENTS);
  const project = getDb().prepare("SELECT name FROM projects ORDER BY id LIMIT 1").get() as { name: string } | undefined;
  const initial = Math.min(Math.max(1, maxByCap), Math.max(1, Number(typeof sp.tokens === "string" ? sp.tokens : 10) || 10));

  if (!holder || holder.kind !== "token") {
    return (<><PageHead title="Invertir" back="/" /><div className="card empty">Tu cuenta no tiene habilitada la compra de tokens.</div></>);
  }

  return (
    <>
      <PageHead title="Sumar inversión" back="/" sub="Elegí cuántos tokens querés, leé la ficha y enviá tu solicitud." />
      <Flash sp={sp} />
      {!e ? <div className="card empty">No hay una emisión abierta en este momento.</div> : (
        <div className="grid cols-2">
          <div>
            {cap?.remainingCents === null ? (
              <div className="alert warn">El cupo de la emisión todavía no está definido. Todavía no se pueden recibir solicitudes.</div>
            ) : maxByCap === 0 ? (
              <div className="alert warn">El cupo de la emisión está completo.</div>
            ) : (
              <form action={investAction} className="form">
                <IdemKey />
                <Simulator capitalCents={ledgerBalances(holder.id).capitalCents} rateBps={e.rate_bps} m2PriceCents={currentM2PriceCents()} ctaHref={null}
                  title="¿Cuántos tokens sumás?" subtitle="Cada token es USD 100. Mové la barra y mirá cuánto ganarías." formName="tokens" follow
                  maxTokens={Math.min(maxByCap, 500)} initialTokens={initial} ctaNote="Estimado al 12% anual pactado. No es una garantía de pago." />
                <div className="card form">
                <label>¿De dónde sale la plata?
                  <select name="source">
                    <option value="aporte">Transferencia en dólares</option>
                    {commissions.map((c) => (
                      <option key={c.id} value={`comision:${c.id}`}>Comisión {c.rendicion_ref} ({usd(commissionFreeCents(c))} disponibles)</option>
                    ))}
                  </select>
                </label>
                <label className="check"><input type="checkbox" name="accept" required />
                  <span>Leí "lo que tenés que saber". Entiendo que el {pct(e.rate_bps)} anual es una tasa pactada, no una garantía de pago.</span>
                </label>
                <SubmitButton className="btn primary">Enviar solicitud de inversión</SubmitButton>
                <p className="note" style={{ margin: 0 }}>Es una solicitud: empieza a generar intereses el día que se confirmen los fondos.</p>
                </div>
              </form>
            )}
          </div>
          <div className="card ficha">
            <h2 style={{ marginBottom: 4 }}>Antes de confirmar: lo que tenés que saber</h2>
            <p className="muted" style={{ marginTop: 0 }}>Todo en palabras simples. Si algo todavía no está definido, lo decimos.</p>
            <dl className="ficha-list">
              <dt>¿Qué estás contratando?</dt>
              <dd>Tokens de USD 100. Cada token es una parte de un préstamo para construir {project?.name ?? "el proyecto"}. No es comprar un pedazo del departamento.</dd>
              <dt>¿Quién responde?</dt>
              <dd>{e.issuer || <span className="pending">A definir por contrato (razón social y responsable).</span>}</dd>
              <dt>¿Cómo rinde?</dt>
              <dd>{pct(e.rate_bps)} anual en dólares, sobre lo que pusiste. Por cada USD 100, alrededor de USD 1 por mes. {e.costs ? `Costos: ${e.costs}.` : <span className="pending">Costos: a confirmar.</span>}</dd>
              <dt>¿Cuándo cobrás?</dt>
              <dd>Los intereses, cada 6 meses desde el día en que se activa tu aporte. El capital, al vencimiento{e.term_months ? `: ${e.term_months} meses${e.term_status === "propuesta" ? " (plazo propuesto, falta confirmarlo)" : ""}, o sea el ${formatDate(addMonths(today(), e.term_months))} si se activa hoy` : ""}.</dd>
              <dt className="ficha-key">¿Cómo salís antes?</dt>
              <dd className="ficha-key">{e.early_redemption_terms || "A definir por contrato. Hoy no hay una forma garantizada de retirar el capital antes del vencimiento."}</dd>
              <dt>¿Qué podés consultar?</dt>
              <dd>Tu contrato, tus comprobantes y las novedades de la obra, en tu panel.</dd>
            </dl>
            <h3 style={{ marginTop: 18 }}>¿Qué pasa después de confirmar?</h3>
            <ol className="steps">
              <li><strong>Recibimos tu solicitud.</strong> Todavía no se mueve plata.</li>
              <li><strong>Hacés la transferencia</strong> (o se toma la parte de tu comisión) y se confirma.</li>
              <li><strong>Tu inversión se activa</strong> y empieza a generar intereses ese mismo día.</li>
            </ol>
          </div>
        </div>
      )}

      <div className="card section">
        <h2>Comisiones en dólares disponibles</h2>
        {commissions.length === 0 ? (
          <p className="muted">No tenés comisiones en dólares disponibles. Las comisiones en pesos y las pendientes no participan de Renta Work.</p>
        ) : commissions.map((c) => {
          const free = commissionFreeCents(c);
          return (
            <form key={c.id} action={commissionSplitAction} className="form" style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
              <IdemKey />
              <input type="hidden" name="commission" value={c.id} />
              <p style={{ margin: 0 }}><strong>Tenés {usd(free)} disponibles</strong> · rendición {c.rendicion_ref}{c.description ? ` · ${c.description}` : ""}</p>
              <div className="inline-form">
                <label>Cobrar (USD)<input name="collect" inputMode="decimal" placeholder="0" /></label>
                <TokensField label="Invertir (tokens)" initial={0} max={Math.min(Math.floor(free / TOKEN_CENTS), maxByCap)} />
              </div>
              <label className="check"><input type="checkbox" name="accept" /><span>Elijo voluntariamente invertir esta parte y acepto las condiciones de la emisión.</span></label>
              <SubmitButton>Confirmar elección</SubmitButton>
            </form>
          );
        })}
        <p className="note" style={{ marginTop: 12 }}>Ejemplo: con USD 2.000 disponibles podés cobrar USD 1.500 e invertir USD 500 = 5 tokens. La inversión queda vinculada a la rendición original y se activa al confirmar los fondos.</p>
      </div>
    </>
  );
}
