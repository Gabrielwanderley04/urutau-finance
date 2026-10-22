import { describe, expect, it } from "vitest";
import { dataValida, diasNoMes, hoje, intervaloDoMes, nomeDoMes, somarDias, somarMeses, ultimosMeses } from "@/lib/datas";

describe("datas", () => {
  it("soma meses atravessando o ano", () => {
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-10", -24)).toBe("2024-10");
  });
  it("últimos 12 meses terminam no mês pedido", () => {
    const m = ultimosMeses("2026-10", 12);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-11");
    expect(m[11]).toBe("2026-10");
  });
  it("intervalo do mês é [início, próximo)", () => {
    expect(intervaloDoMes("2026-12")).toEqual({ inicio: "2026-12-01", fim: "2027-01-01" });
  });
  it("valida datas reais", () => {
    expect(dataValida("2028-02-29")).toBe(true);
    expect(dataValida("2026-02-29")).toBe(false);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(diasNoMes("2026-02")).toBe(28);
  });
  it("soma dias", () => {
    expect(somarDias("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("usa o fuso de São Paulo", () => {
    // 01:30 UTC de 1º de novembro ainda é 31 de outubro em São Paulo (UTC−3)
    expect(hoje(new Date("2026-11-01T01:30:00Z"))).toBe("2026-10-31");
  });
  it("nomes", () => {
    expect(nomeDoMes("2026-03")).toBe("março de 2026");
    expect(nomeDoMes("2026-03", true)).toBe("mar/26");
  });
});
