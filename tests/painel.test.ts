import { describe, expect, it } from "vitest";
import { calcularPontoEquilibrio, participacaoPorFonte, resumirMes } from "@/lib/calculos/painel";

describe("resumo do mês", () => {
  const base = {
    faturamento: 5_000_000, // R$ 50.000
    despesas: [
      { valor: 1_500_000, comportamento: "variavel" as const, entraNoLucro: true }, // mercadorias
      { valor: 1_200_000, comportamento: "fixo" as const, entraNoLucro: true }, // aluguel, folha…
      { valor: 300_000, comportamento: "variavel" as const, entraNoLucro: false }, // DAS pago
    ],
    impostosEstimados: 400_000,
    entradasCaixa: 4_200_000,
    saidasCaixa: 3_100_000,
  };

  it("lucro = faturamento − impostos − despesas que entram no lucro", () => {
    const r = resumirMes(base);
    expect(r.despesas).toBe(2_700_000);
    expect(r.lucro).toBe(5_000_000 - 400_000 - 2_700_000);
    expect(r.margem).toBe(38_000); // 38%
  });

  it("guia de imposto paga não é descontada duas vezes do lucro, mas sai do caixa", () => {
    const r = resumirMes(base);
    expect(r.lucro).toBe(1_900_000);
    expect(r.caixa.saldo).toBe(1_100_000);
  });

  it("sem imposto disponível, lucro sai sem impostos e sinaliza", () => {
    const r = resumirMes({ ...base, impostosEstimados: null });
    expect(r.impostosDisponiveis).toBe(false);
    expect(r.lucro).toBe(2_300_000);
  });

  it("prejuízo dá margem negativa", () => {
    const r = resumirMes({ ...base, faturamento: 2_000_000 });
    expect(r.lucro).toBe(-1_100_000);
    expect(r.margem).toBe(-55_000);
  });

  it("sem faturamento a margem fica indefinida", () => {
    const r = resumirMes({ ...base, faturamento: 0 });
    expect(r.margem).toBeNull();
    expect(r.pontoEquilibrio).toEqual({ tipo: "sem_faturamento" });
  });
});

describe("ponto de equilíbrio", () => {
  it("fixos ÷ margem de contribuição", () => {
    // faturou 50 mil, variáveis 19 mil (mercadorias + impostos) → contribuição 62%
    // fixos 12 mil ÷ 0,62 = 19.354,838… → arredonda para cima
    const pe = calcularPontoEquilibrio(5_000_000, 1_200_000, 1_900_000);
    expect(pe).toEqual({ tipo: "valor", valor: 1_935_484, folga: 5_000_000 - 1_935_484 });
  });

  it("no ponto de equilíbrio o lucro é zero (ou o primeiro centavo positivo)", () => {
    const fat = 3_700_000, fixos = 987_654, variaveis = 1_234_567;
    const pe = calcularPontoEquilibrio(fat, fixos, variaveis);
    if (pe.tipo !== "valor") throw new Error();
    const lucroNoPe = (v: number) => v - fixos - (variaveis * v) / fat;
    expect(lucroNoPe(pe.valor)).toBeGreaterThanOrEqual(0);
    expect(lucroNoPe(pe.valor - 1)).toBeLessThan(0);
  });

  it("sem custos fixos o equilíbrio é zero", () => {
    expect(calcularPontoEquilibrio(100_000, 0, 50_000)).toMatchObject({ valor: 0 });
  });

  it("custos variáveis maiores que o faturamento: não existe equilíbrio", () => {
    expect(calcularPontoEquilibrio(100_000, 10_000, 120_000)).toEqual({ tipo: "margem_negativa" });
  });
});

describe("participação por fonte", () => {
  it("ordena e soma exatamente 100%", () => {
    const r = participacaoPorFonte([
      { id: "a", nome: "Loja", valor: 100 },
      { id: "b", nome: "Site", valor: 100 },
      { id: "c", nome: "Delivery", valor: 100 },
    ]);
    expect(r.reduce((s, f) => s + f.participacao, 0)).toBe(100_000);
    expect(r.map((f) => f.participacao).sort()).toEqual([33_333, 33_333, 33_334]);
  });

  it("maior fonte primeiro", () => {
    const r = participacaoPorFonte([
      { id: "a", nome: "Loja", valor: 2_500 },
      { id: "b", nome: "Site", valor: 7_500 },
    ]);
    expect(r[0]).toMatchObject({ nome: "Site", participacao: 75_000 });
  });

  it("sem vendas, participação zero", () => {
    expect(participacaoPorFonte([{ id: "a", nome: "Loja", valor: 0 }])[0].participacao).toBe(0);
  });
});

describe("folha e juros no resumo", () => {
  it("custo dos funcionários e juros entram no lucro como despesas fixas", () => {
    const r = resumirMes({
      faturamento: 5_000_000,
      despesas: [{ valor: 1_000_000, comportamento: "variavel", entraNoLucro: true }],
      folha: 900_000,
      juros: 60_000,
      impostosEstimados: 0,
      entradasCaixa: 0,
      saidasCaixa: 0,
    });
    expect(r.despesas).toBe(1_960_000);
    expect(r.despesasLancadas).toBe(1_000_000);
    expect(r.despesasFixas).toBe(960_000);
    expect(r.lucro).toBe(3_040_000);
  });
});
