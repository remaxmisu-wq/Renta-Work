import { commissionSplitAction, investAction } from "@/app/actions";
import { resolveHolder, type SP } from "@/lib/session";
import { formatDate, addMonths, today } from "@/lib/dates";
import { availableCommissions, capUsage, commissionFreeCents, currentEmission } from "@/lib/ledger";
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

  if (!holder || holder.kind !== "token") {
    return (<><PageHead title="Invertir" back="/" /><div className="card empty">Tu cuenta no tiene habilitada la compra de tokens.</div></>);
  }

  return (
    <>
      <PageHead title="Invertir" back="/" sub="Comprás tokens enteros de USD 100. Empiezan a generar intereses cuando se confirman los fondos." />
      <Flash sp={sp} />
      {!e ? <div className="card empty">No hay una emisión abierta en este momento.</div> : (
        <div className="grid cols-2">
          <div className="card">
            <h2>Nueva inversión</h2>
            {cap?.remainingCents === null ? (
              <div className="alert warn">El cupo de la emisión todavía no está definido. Todavía no se pueden recibir solicitudes.</div>
            ) : maxByCap === 0 ? (
              <div className="alert warn">El cupo de la emisión está completo.</div>
            ) : (
              <form action={investAction} className="form">
                <IdemKey />
                <TokensField max={maxByCap} initial={Math.min(maxByCap, Math.max(1, Number(typeof sp.tokens === "string" ? sp.tokens : 1) || 1))} />
                <label>Origen de los fondos
                  <select name="source">
                    <option value="aporte">Transferencia en dólares</option>
                    {commissions.map((c) => (
                      <option key={c.id} value={`comision:${c.id}`}>Comisión {c.rendicion_ref} ({usd(commissionFreeCents(c))} disponibles)</option>
                    ))}
                  </select>
                </label>
                <label className="check"><input type="checkbox" name="accept" required />
                  <span>Leí las condiciones: tasa {pct(e.rate_bps)} nominal anual, interés simple, liquidación cada 6 meses desde la activación{e.term_months ? `, plazo de ${e.term_months} meses${e.term_status === "propuesta" ? " (propuesta pendiente de confirmación)" : ""}` : ""}. La tasa contractual no es una garantía de pago.</span>
                </label>
                <SubmitButton>Enviar solicitud</SubmitButton>
                <p className="note">La solicitud queda pendiente. Se activa en la fecha en que el administrador confirme los fondos.</p>
              </form>
            )}
          </div>
          <div className="card">
            <h2>Condiciones de la emisión</h2>
            <dl className="kv">
              <dt>Emisión</dt><dd>{e.name}</dd>
              <dt>Tasa nominal anual</dt><dd>{pct(e.rate_bps)}</dd>
              <dt>Liquidación</dt><dd>Cada 6 meses por posición</dd>
              <dt>Plazo</dt><dd>{e.term_months ? `${e.term_months} meses${e.term_status === "propuesta" ? " (propuesta)" : ""}` : "A definir"}</dd>
              <dt>Vencimiento si se activa hoy</dt><dd>{e.term_months ? formatDate(addMonths(today(), e.term_months)) : "—"}</dd>
              <dt>Cupo disponible</dt><dd>{cap?.remainingCents == null ? "Sin definir" : usd(cap.remainingCents)}</dd>
            </dl>
            <h3 style={{ marginTop: 16 }}>Devolución anticipada</h3>
            <p className="muted">{e.early_redemption_terms || "A definir por contrato."}</p>
            <h3>Condiciones de salida</h3>
            <p className="muted">{e.exit_terms || "A definir por contrato."}</p>
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
