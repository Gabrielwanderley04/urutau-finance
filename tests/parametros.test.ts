import { describe, expect, it } from "vitest";
import { resolverParametro, resolverVarios } from "@/lib/calculos/parametros";

const globais = [
  { chave: "pis", valor: 650, vigenciaInicio: "2000-01-01", vigenciaFim: "2026-12-31" },
  { chave: "cbs", valor: 900, vigenciaInicio: "2027-01-01", vigenciaFim: null },
  { chave: "rat", valor: 2_000, vigenciaInicio: "2000-01-01", vigenciaFim: null },
  { chave: "rat", valor: 2_500, vigenciaInicio: "2026-07-01", vigenciaFim: null },
];

describe("parâmetros com vigência", () => {
  it("usa o valor vigente na data", () => {
    expect(resolverParametro("pis", "2026-10-01", globais)).toBe(650);
    expect(() => resolverParametro("pis", "2027-01-01", globais)).toThrow(/sem valor vigente/);
    expect(resolverParametro("cbs", "2027-03-01", globais)).toBe(900);
  });
  it("com sobreposição, vale o que começou por último", () => {
    expect(resolverParametro("rat", "2026-06-30", globais)).toBe(2_000);
    expect(resolverParametro("rat", "2026-07-01", globais)).toBe(2_500);
  });
  it("o valor da empresa tem prioridade", () => {
    const empresa = [{ chave: "rat", valor: 1_500, vigenciaInicio: "2026-01-01", vigenciaFim: null }];
    expect(resolverParametro("rat", "2026-10-01", globais, empresa)).toBe(1_500);
    expect(resolverParametro("rat", "2025-10-01", globais, empresa)).toBe(2_000);
  });
  it("resolve vários de uma vez", () => {
    expect(resolverVarios(["pis", "rat"] as const, "2026-10-01", globais)).toEqual({ pis: 650, rat: 2_500 });
  });
});
