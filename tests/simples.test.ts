import { describe, expect, it } from "vitest";
import {
  type Anexo,
  type FaixaSimples,
  acumulado12,
  aliquotaEfetiva,
  calcularFatorR,
  calcularSimples,
  encontrarFaixa,
  impostoSimples,
} from "@/lib/calculos/simples";
import { somarMeses } from "@/lib/datas";

const R = (reais: number) => Math.round(reais * 100);
/** Série com todo o valor em setembro: a soma dos 12 meses antes de outubro é exatamente `total`. */
const umMes = (total: number) => (m: string) => (m === "2026-09" ? total : 0);
// [teto da faixa, nominal %, parcela a deduzir] — LC 123/2006
const TABELAS: Record<Anexo, [number, number, number][]> = {
  I: [[180e3, 4, 0], [360e3, 7.3, 5940], [720e3, 9.5, 13860], [1.8e6, 10.7, 22500], [3.6e6, 14.3, 87300], [4.8e6, 19, 378000]],
  II: [[180e3, 4.5, 0], [360e3, 7.8, 5940], [720e3, 10, 13860], [1.8e6, 11.2, 22500], [3.6e6, 14.7, 85500], [4.8e6, 30, 720000]],
  III: [[180e3, 6, 0], [360e3, 11.2, 9360], [720e3, 13.5, 17640], [1.8e6, 16, 35640], [3.6e6, 21, 125640], [4.8e6, 33, 648000]],
  IV: [[180e3, 4.5, 0], [360e3, 9, 8100], [720e3, 10.2, 12420], [1.8e6, 14, 39780], [3.6e6, 22, 183780], [4.8e6, 33, 828000]],
  V: [[180e3, 15.5, 0], [360e3, 18, 4500], [720e3, 19.5, 9900], [1.8e6, 20.5, 17100], [3.6e6, 23, 62100], [4.8e6, 30.5, 540000]],
};
export const FAIXAS = Object.fromEntries(
  Object.entries(TABELAS).map(([anexo, linhas]) => [
    anexo,
    linhas.map(([ate, nom, pd], i): FaixaSimples => ({ anexo: anexo as Anexo, faixa: i + 1, receitaAte: R(ate), aliquotaNominal: Math.round(nom * 1000), parcelaDeduzir: R(pd) })),
  ]),
) as Record<Anexo, FaixaSimples[]>;

describe("faixa e alíquota efetiva", () => {
  it("Anexo I, RBT12 R$ 500 mil → 3ª faixa, efetiva 6,728%", () => {
    const { faixa } = encontrarFaixa(R(500_000), FAIXAS.I);
    expect(faixa.faixa).toBe(3);
    expect(aliquotaEfetiva(R(500_000), faixa)).toBe(6_728);
    expect(impostoSimples(R(50_000), R(500_000), faixa)).toBe(R(3_364));
  });

  it("Anexo III, RBT12 R$ 1,2 milhão → 4ª faixa, efetiva 13,03%", () => {
    const { faixa } = encontrarFaixa(R(1_200_000), FAIXAS.III);
    expect(aliquotaEfetiva(R(1_200_000), faixa)).toBe(13_030);
    expect(impostoSimples(R(100_000), R(1_200_000), faixa)).toBe(R(13_030));
  });

  it("Anexo V, RBT12 R$ 500 mil → efetiva 17,52%", () => {
    expect(aliquotaEfetiva(R(500_000), encontrarFaixa(R(500_000), FAIXAS.V).faixa)).toBe(17_520);
  });

  it("1ª faixa: efetiva = nominal", () => {
    const { faixa } = encontrarFaixa(R(100_000), FAIXAS.I);
    expect(aliquotaEfetiva(R(100_000), faixa)).toBe(4_000);
    expect(impostoSimples(R(10_000), R(100_000), faixa)).toBe(R(400));
  });

  it("o teto da faixa pertence a ela; um centavo acima já é a próxima", () => {
    expect(encontrarFaixa(R(180_000), FAIXAS.I).faixa.faixa).toBe(1);
    expect(encontrarFaixa(R(180_000) + 1, FAIXAS.I).faixa.faixa).toBe(2);
  });

  it("acima de R$ 4,8 milhões: usa a 6ª faixa e sinaliza", () => {
    const r = encontrarFaixa(R(5_000_000), FAIXAS.I);
    expect(r).toMatchObject({ acimaDoLimite: true, faixa: { faixa: 6 } });
  });

  it("imposto não arredonda a alíquota antes de multiplicar", () => {
    // RBT12 R$ 333.333,33 → efetiva (24.333,33 − 5.940) ÷ 333.333,33 = 5,518%...
    const rbt12 = 33_333_333;
    const { faixa } = encontrarFaixa(rbt12, FAIXAS.I);
    const exato = (1_000_000 * (rbt12 * 0.073 - 594_000)) / rbt12;
    expect(impostoSimples(1_000_000, rbt12, faixa)).toBe(Math.round(exato));
  });
});

describe("RBT12", () => {
  const receitas: Record<string, number> = {};
  for (let i = 1; i <= 24; i++) receitas[somarMeses("2026-10", -i)] = R(10_000 * i);
  const de = (m: string) => receitas[m] ?? 0;

  it("soma os 12 meses anteriores (sem o mês atual)", () => {
    // meses −1 a −12 → 10k + 20k + … + 120k = 780k
    expect(acumulado12("2026-10", de, "2020-01")).toEqual({ valor: R(780_000), metodo: "soma_12", mesesConsiderados: 12 });
    expect(acumulado12("2026-10", de, null).valor).toBe(R(780_000));
  });

  it("início de atividade: 1º mês usa a receita do próprio mês × 12", () => {
    expect(acumulado12("2026-07", () => R(20_000), "2026-07")).toMatchObject({ valor: R(240_000), metodo: "primeiro_mes" });
  });

  it("do 2º ao 12º mês: média dos meses anteriores × 12", () => {
    const v: Record<string, number> = { "2026-07": R(30_000), "2026-08": R(40_000), "2026-09": R(50_000), "2026-10": R(999_999) };
    expect(acumulado12("2026-10", (m) => v[m] ?? 0, "2026-07")).toMatchObject({ valor: R(480_000), metodo: "media_proporcional", mesesConsiderados: 3 });
  });
});

describe("Fator R", () => {
  it("folha ≥ 28% da receita → Anexo III", () => {
    expect(calcularFatorR(R(150_000), R(500_000), 28_000)).toMatchObject({ fator: 30_000, anexo: "III" });
    expect(calcularFatorR(R(140_000), R(500_000), 28_000)).toMatchObject({ fator: 28_000, anexo: "III" });
  });
  it("abaixo de 28% (mesmo 27,999%) → Anexo V", () => {
    expect(calcularFatorR(R(139_999), R(500_000), 28_000)).toMatchObject({ fator: 27_999, anexo: "V" });
  });

  it("muda o imposto: serviço de R$ 40 mil com RBT12 de R$ 500 mil", () => {
    const base = {
      mes: "2026-10",
      receitaComercio: 0,
      receitaServico: R(40_000),
      receitaTotalDe: umMes(R(500_000)),
      inicioAtividade: null,
      anexoComercio: null,
      anexoServicos: "V" as Anexo,
      sujeitoFatorR: true,
      tabelas: FAIXAS,
      fatorRMinimo: 28_000,
      limiteAnual: R(4_800_000),
      sublimite: R(3_600_000),
    };
    const comFolhaAlta = calcularSimples({ ...base, folhaDe: umMes(R(150_000)) });
    expect(comFolhaAlta.fatorR?.anexo).toBe("III");
    expect(comFolhaAlta.parcelas[0]).toMatchObject({ anexo: "III", aliquotaEfetiva: 9_972 });
    expect(comFolhaAlta.total).toBe(R(3_988.8));

    const comFolhaBaixa = calcularSimples({ ...base, folhaDe: umMes(R(60_000)) });
    expect(comFolhaBaixa.fatorR?.anexo).toBe("V");
    expect(comFolhaBaixa.total).toBe(R(7_008));
  });
});

describe("empresa com comércio e serviço", () => {
  it("cada natureza no seu anexo, com o mesmo RBT12", () => {
    const r = calcularSimples({
      mes: "2026-10",
      receitaComercio: R(30_000),
      receitaServico: R(10_000),
      receitaTotalDe: umMes(R(500_000)),
      folhaDe: () => 0,
      inicioAtividade: null,
      anexoComercio: "I",
      anexoServicos: "III",
      sujeitoFatorR: false,
      tabelas: FAIXAS,
      fatorRMinimo: 28_000,
      limiteAnual: R(4_800_000),
      sublimite: R(3_600_000),
    });
    expect(r.parcelas.map((p) => [p.anexo, p.imposto])).toEqual([
      ["I", R(2_018.4)], // 6,728%
      ["III", R(997.2)], // 9,972%
    ]);
    expect(r.total).toBe(R(3_015.6));
  });
});
