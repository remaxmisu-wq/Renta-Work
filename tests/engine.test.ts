import { describe, expect, it } from "vitest";
import { addMonths, daysBetween } from "../lib/dates";
import {
  accrueUsd, accruedToDate, changeOutstanding, nextSettlementDate, nextTokenProgress,
  settleDue, splitIntoTokens, theoreticalEffectiveAnnual, xirr, m2Equivalent, snowball, type PositionState,
} from "../lib/engine";
import { usd, parseUsdInput } from "../lib/money";

const pos = (o: Partial<PositionState> = {}): PositionState => ({
  outstandingCents: 1_000_000, // USD 10.000
  rateBps: 1200,
  activationDate: "2026-01-15",
  maturityDate: null,
  settlementsCount: 0,
  accrualFrom: "2026-01-15",
  carry: "0",
  ...o,
});

describe("fechas", () => {
  it("suma meses con ajuste a fin de mes", () => {
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("cuenta días reales", () => {
    expect(daysBetween("2026-01-15", "2026-07-15")).toBe(181);
    expect(daysBetween("2026-07-15", "2027-01-15")).toBe(184);
  });
});

describe("interés simple días reales / 365", () => {
  it("calcula un período de 181 días", () => {
    // 10.000 × 0,12 × 181 / 365 = 595,0684931...
    expect(accrueUsd(1_000_000, 1200, "2026-01-15", "2026-07-15").toFixed(6)).toBe("595.068493");
  });
  it("muestra interés en curso diario", () => {
    expect(accruedToDate(pos(), "2026-01-25").toFixed(4)).toBe("32.8767");
  });
  it("no devenga después del vencimiento", () => {
    const p = pos({ maturityDate: "2026-03-15" });
    expect(accruedToDate(p, "2026-06-01").toFixed(6)).toBe(accrueUsd(1_000_000, 1200, "2026-01-15", "2026-03-15").toFixed(6));
  });
});

describe("liquidación por posición", () => {
  it("liquida cada 6 meses desde la activación y conserva el residuo", () => {
    const { settlements, state } = settleDue(pos(), "2027-01-20");
    expect(settlements.map((s) => s.periodEnd)).toEqual(["2026-07-15", "2027-01-15"]);
    expect(settlements[0].amountCents).toBe(59_506); // 595,06 (truncado)
    // residuo 0,0084931… pasa al período siguiente
    // 10.000 × 0,12 × 184 / 365 = 604,9315… + 0,0084931… = 604,94000…
    expect(settlements[1].amountCents).toBe(60_494);
    expect(state.settlementsCount).toBe(2);
    expect(state.accrualFrom).toBe("2027-01-15");
    expect(Number(state.carry)).toBeLessThan(0.01);
    expect(nextSettlementDate(state)).toBe("2027-07-15");
  });

  it("es idempotente: liquidar dos veces a la misma fecha no repite", () => {
    const a = settleDue(pos(), "2026-08-01");
    const b = settleDue(a.state, "2026-08-01");
    expect(a.settlements).toHaveLength(1);
    expect(b.settlements).toHaveLength(0);
  });

  it("dos aportes en fechas distintas tienen calendarios propios", () => {
    const a = pos({ activationDate: "2026-02-01", accrualFrom: "2026-02-01" });
    const b = pos({ activationDate: "2026-05-10", accrualFrom: "2026-05-10" });
    expect(nextSettlementDate(a)).toBe("2026-08-01");
    expect(nextSettlementDate(b)).toBe("2026-11-10");
  });

  it("la última liquidación cae al vencimiento y redondea sin dejar residuo", () => {
    const p = pos({ maturityDate: "2026-10-15" });
    const { settlements, state } = settleDue(p, "2027-12-31");
    expect(settlements.map((s) => s.periodEnd)).toEqual(["2026-07-15", "2026-10-15"]);
    expect(settlements[1].final).toBe(true);
    expect(state.carry).toBe("0");
    expect(nextSettlementDate(state)).toBeNull();
    const total = settlements.reduce((a, s) => a + s.amountCents, 0);
    expect(total).toBe(Math.round(10_000 * 0.12 * 273 / 365 * 100));
  });

  it("período parcial por rescate a mitad de período", () => {
    const p = changeOutstanding(pos(), "2026-04-15", 500_000); // devuelve USD 5.000 a los 90 días
    const { settlements } = settleDue(p, "2026-07-15");
    const exact = 10_000 * 0.12 * 90 / 365 + 5_000 * 0.12 * 91 / 365;
    expect(settlements[0].amountCents).toBe(Math.floor(exact * 100));
  });

  it("intereses chicos: el residuo nunca se pierde en 10 años", () => {
    let s = pos({ outstandingCents: 10_000 }); // 1 token
    let paid = 0;
    const r = settleDue(s, "2036-01-15");
    paid = r.settlements.reduce((a, x) => a + x.amountCents, 0);
    s = r.state;
    const exact = 100 * 0.12 * daysBetween("2026-01-15", "2036-01-15") / 365;
    expect(paid / 100 + Number(s.carry)).toBeCloseTo(exact, 9);
  });
});

describe("reinversión en bloques de USD 100", () => {
  it("ejemplo del enunciado: 237,45 → 2 tokens y 37,45 de saldo", () => {
    expect(splitIntoTokens(23_745)).toEqual({ tokens: 2, amountCents: 20_000, remainderCents: 3_745, limitedByCap: false });
  });
  it("102 → 1 token y 2 a favor", () => {
    expect(splitIntoTokens(10_200).remainderCents).toBe(200);
  });
  it("menos de 100 no compra", () => {
    expect(splitIntoTokens(9_999).tokens).toBe(0);
  });
  it("cupo insuficiente compra sólo lo que entra", () => {
    const r = splitIntoTokens(50_000, { capRemainingCents: 25_000 });
    expect(r).toEqual({ tokens: 2, amountCents: 20_000, remainderCents: 30_000, limitedByCap: true });
  });
  it("respeta la cantidad elegida en reinversión manual", () => {
    expect(splitIntoTokens(50_000, { maxTokens: 3 }).tokens).toBe(3);
  });
  it("barra de próximo token", () => {
    expect(nextTokenProgress(3_745)).toMatchObject({ fullTokens: 0, towardNextCents: 3_745, missingCents: 6_255 });
    expect(nextTokenProgress(23_745)).toMatchObject({ fullTokens: 2, towardNextCents: 3_745 });
  });
});

describe("rendimiento", () => {
  it("TEA teórica 12,36 %", () => {
    expect(theoreticalEffectiveAnnual(1200)).toBeCloseTo(0.1236, 10);
  });
  it("XIRR de un año al 12 %", () => {
    const r = xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1120 }]);
    expect(r).toBeCloseTo(0.12, 6);
  });
  it("XIRR no disponible con poca historia", () => {
    expect(xirr([{ date: "2026-01-01", amount: -1000 }, { date: "2026-01-10", amount: 1001 }])).toBeNull();
    expect(xirr([{ date: "2026-01-01", amount: -1000 }])).toBeNull();
  });
  it("equivalencia orientativa: USD 100 = 0,10 m² a USD 1.000/m²", () => {
    expect(m2Equivalent(10_000, 100_000)).toBeCloseTo(0.1);
  });
});

describe("formato", () => {
  it("dólares en español argentino", () => {
    expect(usd(23_745)).toBe("USD 237,45");
    expect(usd(30_226_000)).toBe("USD 302.260,00");
    expect(usd(500, { sign: true })).toBe("+USD 5,00");
  });
  it("lee importes", () => {
    expect(parseUsdInput("1.234,56")).toBe(123_456);
    expect(parseUsdInput("500")).toBe(50_000);
  });
});

describe("bola de nieve", () => {
  it("reinvertir en tokens enteros rinde más que cobrar", () => {
    const pts = snowball(100_000, 1200, 5); // USD 1.000
    const last = pts[pts.length - 1];
    expect(last.collectCents).toBe(160_000); // 1.000 + 10 × 60
    expect(last.reinvestCents).toBeGreaterThan(last.collectCents);
    expect(last.reinvestCapitalCents % 10_000).toBe(0);
    expect(pts).toHaveLength(11);
  });
});
