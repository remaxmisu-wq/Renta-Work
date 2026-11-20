// Ejecuta las liquidaciones vencidas a hoy (programar a diario, por ejemplo con cron).
import { today } from "../lib/dates";
import { runSettlements } from "../lib/ledger";
import { usd } from "../lib/money";

const asOf = process.argv[2] || today();
const r = runSettlements(asOf, null);
console.log(`Liquidaciones al ${asOf}: ${r.settlements} por ${usd(r.totalCents)}; ${r.reinvestments} reinversiones automáticas.`);
for (const n of r.notices) console.log("Aviso:", n);
