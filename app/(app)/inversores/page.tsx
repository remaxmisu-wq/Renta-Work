import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDateLong, today } from "@/lib/dates";
import { usd } from "@/lib/money";
import { investorList } from "@/lib/views";
import { DemoBadge } from "@/components/ui";

export default async function InvestorsPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const asOf = today();
  const { rows, others, total } = investorList(asOf, { adminView: admin, includeDemo: true });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inversores</h1>
          <p className="muted" style={{ margin: 0 }}>Cuánto puso cada uno y cuánto le vienen generando sus intereses, al {formatDateLong(asOf)}.</p>
        </div>
      </div>
      <div className="card">
        {rows.length === 0 && !others ? <p className="muted" style={{ margin: 0 }}>Todavía no hay inversores para mostrar.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Inversor</th><th className="r">Puso</th><th className="r">Intereses generados</th><th className="r hide-sm">Genera por mes</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.holderId}>
                    <td>{admin ? <Link href={`/?titular=${r.holderId}`}>{r.name}</Link> : r.name} <DemoBadge show={r.isDemo} /></td>
                    <td className="r num amount-capital">{usd(r.investedCents)}</td>
                    <td className="r num amount-interest">+ {usd(r.generatedCents)}</td>
                    <td className="r num hide-sm">{usd(r.perMonthCents)}</td>
                  </tr>
                ))}
                {others && (
                  <tr>
                    <td>Otros {others.count} inversores</td>
                    <td className="r num amount-capital">{usd(others.investedCents)}</td>
                    <td className="r num amount-interest">+ {usd(others.generatedCents)}</td>
                    <td className="r num hide-sm">{usd(others.perMonthCents)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ borderTop: "1px solid var(--ink)" }}><strong>Total</strong></td>
                  <td className="r num" style={{ borderTop: "1px solid var(--ink)" }}><strong>{usd(total.investedCents)}</strong></td>
                  <td className="r num amount-interest" style={{ borderTop: "1px solid var(--ink)" }}>+ {usd(total.generatedCents)}</td>
                  <td className="r num hide-sm" style={{ borderTop: "1px solid var(--ink)" }}><strong>{usd(total.perMonthCents)}</strong></td>
                </tr>
              </tbody>
            </table>
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
