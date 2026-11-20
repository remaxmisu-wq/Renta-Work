// Fechas como "AAAA-MM-DD" (sin hora), calculadas en UTC para evitar corrimientos.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Fecha de hoy. RW_TODAY permite fijarla (pruebas y demostraciones). */
export function today(): ISODate {
  return process.env.RW_TODAY || toISO(new Date());
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / DAY_MS);
}

export function addDays(d: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(d).getTime() + n * DAY_MS));
}

/** Suma meses ajustando a fin de mes: 31/08 + 6 = 28/02 (o 29/02). */
export function addMonths(d: ISODate, months: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return toISO(new Date(Date.UTC(ny, nm, Math.min(day, lastDay))));
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function formatDateLong(d: ISODate | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export function monthLabel(d: ISODate): string {
  const [y, m] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
