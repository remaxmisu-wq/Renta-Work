import Link from "next/link";
import { importLoanAction, interestPaymentAction, returnCapitalAction, saveHolderAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { formatDate, today } from "@/lib/dates";
import { portfolio, type Holder } from "@/lib/ledger";
import { usd } from "@/lib/money";
import type { SP } from "@/lib/session";
import { SubmitButton } from "@/components/SubmitButton";
import { DemoBadge, Flash, IdemKey, PageHead } from "@/components/ui";

const CONSENT: Record<string, string> = {
  ninguno: "No autorizado (no se publica)",
  agregado: "Sólo datos agregados",
  anonimo: "Montos sin nombre",
  completo: "Nombre, montos y posiciones",
};

export default async function HoldersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = getDb();
  const holders = db.prepare("SELECT * FROM holders ORDER BY is_demo, name").all() as Holder[];
  const users = db.prepare("SELECT id, name, email FROM users ORDER BY name").all() as { id: number; name: string; email: string }[];
  return (
    <>
      <PageHead title="Titulares" sub="Inversores Renta Work y préstamos preexistentes. Consentimiento, vínculo con usuario y operaciones registradas." />
      <Flash sp={sp} />
      {holders.map((h) => {
        const pf = portfolio(h.id, today());
        const active = pf.positions.filter((p) => p.status !== "cancelada");
        return (
          <details className="card" key={h.id} style={{ marginBottom: 12 }}>
            <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>{h.name}</strong> <DemoBadge show={h.is_demo} /> <span className="badge">{h.kind === "prestamo" ? "Préstamo preexistente" : "Tokens"}</span>
                {h.auto_reinvest ? <span className="badge">Reinversión automática</span> : null}
                <br /><small className="faint">Consentimiento: {CONSENT[h.consent]}{h.consent_at ? ` (desde ${h.consent_at.slice(0, 10)})` : ""}</small>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="amount-capital num">{usd(pf.balances.capitalCents)}</span><br />
                <small className="amount-interest num">+{usd(pf.accruedCents + pf.balances.availableCents)} intereses</small>
              </span>
            </summary>
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="actions">
                <Link className="btn small" href={`/?titular=${h.id}`}>Ver portfolio</Link>
                <Link className="btn small" href={`/movimientos?titular=${h.id}`}>Movimientos</Link>
              </div>
              {!pf.reconciled && <div className="alert warn">Pendiente de conciliación: posiciones {usd(pf.outstandingFromPositionsCents)} vs movimientos {usd(pf.balances.capitalCents)}.</div>}
              <form action={saveHolderAction} className="inline-form">
                <input type="hidden" name="id" value={h.id} />
                <label>Nombre<input name="name" defaultValue={h.name} required /></label>
                <label>Usuario del CRM
                  <select name="user" defaultValue={h.user_id ?? ""}>
                    <option value="">Sin usuario</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                </label>
                <label>Consentimiento para “Inversores”
                  <select name="consent" defaultValue={h.consent}>
                    {Object.entries(CONSENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <SubmitButton className="btn small">Guardar</SubmitButton>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Activación</th><th>Origen</th><th className="r">Original</th><th className="r">Pendiente</th><th className="r">En curso</th><th>Próx. liq.</th><th>Vence</th><th>Devolver capital</th></tr></thead>
                  <tbody>
                    {active.map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td><td>{formatDate(p.activation_date)}</td><td>{p.origin}</td>
                        <td className="r num">{usd(p.principal_cents)}</td><td className="r num">{usd(p.outstanding_cents)}</td>
                        <td className="r num">{usd(p.accruedCents)}</td><td>{formatDate(p.nextSettlement)}</td><td>{formatDate(p.maturity_date)}</td>
                        <td>
                          {p.outstanding_cents > 0 && (
                            <form action={returnCapitalAction} style={{ display: "flex", gap: 4 }}>
                              <input type="hidden" name="position" value={p.id} />
                              <input name="amount" placeholder="USD" style={{ width: 90, minHeight: 34, padding: 6 }} />
                              <input type="date" name="date" defaultValue={today()} style={{ width: 140, minHeight: 34, padding: 6 }} />
                              <input name="reference" placeholder="Ref." style={{ width: 70, minHeight: 34, padding: 6 }} />
                              <SubmitButton className="btn small" confirm="¿Registrar la devolución de capital?">OK</SubmitButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form action={interestPaymentAction} className="inline-form">
                <input type="hidden" name="holder" value={h.id} />
                <label>Registrar pago de intereses ya realizado (USD)<input name="amount" placeholder={`hasta ${usd(pf.balances.availableCents)}`} /></label>
                <label>Fecha<input type="date" name="date" defaultValue={today()} /></label>
                <label>Referencia<input name="reference" /></label>
                <SubmitButton className="btn small">Registrar pago</SubmitButton>
              </form>
              {h.kind === "prestamo" && (
                <form action={importLoanAction} className="inline-form">
                  <IdemKey />
                  <input type="hidden" name="holder" value={h.id} />
                  <label>Importar saldo inicial (USD)<input name="amount" required /></label>
                  <label>Fecha base<input type="date" name="date" required /></label>
                  <label>Tasa anual %<input name="rate" defaultValue="12" required /></label>
                  <label>Vencimiento (si está documentado)<input type="date" name="maturity" /></label>
                  <label>Fuente<input name="reference" defaultValue="ClaudeFinanciero" /></label>
                  <SubmitButton className="btn small">Importar</SubmitButton>
                </form>
              )}
            </div>
          </details>
        );
      })}
      <div className="card section">
        <h2>Nuevo titular</h2>
        <form action={saveHolderAction} className="inline-form">
          <label>Nombre<input name="name" required /></label>
          <label>Tipo<select name="kind"><option value="token">Inversor Renta Work (tokens)</option><option value="prestamo">Préstamo preexistente</option></select></label>
          <label>Usuario del CRM
            <select name="user"><option value="">Sin usuario</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </label>
          <label>Consentimiento<select name="consent">{Object.entries(CONSENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <SubmitButton className="btn small">Crear</SubmitButton>
        </form>
      </div>
    </>
  );
}
