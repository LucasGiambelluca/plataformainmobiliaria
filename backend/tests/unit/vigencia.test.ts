import { DIAS_DE_GRACIA, estaAlDia, type VigenciaInput } from "@/modules/subscriptions/vigencia";

const DIA = 24 * 60 * 60 * 1000;
const FIN = new Date("2026-10-01T00:00:00Z");
const despues = (dias: number) => new Date(FIN.getTime() + dias * DIA);

const sub = (o: Partial<VigenciaInput> = {}): VigenciaInput => ({
  status: "active",
  currentPeriodEnd: FIN,
  plan: { priceAmount: "29999" },
  ...o,
});

describe("estaAlDia", () => {
  it("el plan gratuito siempre está al día", () => {
    expect(estaAlDia(sub({ plan: { priceAmount: "0" }, status: "past_due" }), despues(90))).toBe(true);
  });

  it("dentro del período pagado está al día", () => {
    expect(estaAlDia(sub(), despues(-1))).toBe(true);
  });

  it("vencida dentro de la gracia sigue al día: cubre los reintentos de débito", () => {
    expect(estaAlDia(sub({ status: "past_due" }), despues(DIAS_DE_GRACIA - 1))).toBe(true);
  });

  it("pasada la gracia ya no", () => {
    expect(estaAlDia(sub({ status: "past_due" }), despues(DIAS_DE_GRACIA + 1))).toBe(false);
  });

  it("activa pero sin débito que la renueve también vence: el estado no alcanza", () => {
    // El caso que motiva mirar la fecha y no solo el estado: si la pasarela
    // deja de mandar débitos sin avisar nada, el estado se queda en `active`.
    expect(estaAlDia(sub(), despues(DIAS_DE_GRACIA + 1))).toBe(false);
  });

  it("cancelada no tiene gracia: rige hasta el fin del período pagado", () => {
    expect(estaAlDia(sub({ status: "canceled" }), despues(-1))).toBe(true);
    expect(estaAlDia(sub({ status: "canceled" }), despues(1))).toBe(false);
  });

  it("suspendida nunca está al día", () => {
    expect(estaAlDia(sub({ status: "suspended" }), despues(-1))).toBe(false);
  });

  it("sin período (plan asignado a mano por el super admin) está al día", () => {
    expect(estaAlDia(sub({ currentPeriodEnd: null }), despues(365))).toBe(true);
  });
});
