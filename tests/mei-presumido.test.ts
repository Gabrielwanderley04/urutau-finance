import { describe, expect, it } from "vitest";
import { calcularMei } from "@/lib/calculos/mei";
import { type ParametrosPresumido, basePresumida, calcularPresumido, excedenteNoMes, irpjCsllTrimestre } from "@/lib/calculos/presumido";

const R = (reais: number) => Math.round(reais * 100);

describe("MEI", () => {
  const base = {
    mes: "2026-10",
    dasPorAtividade: { comercio: 8_205, servicos: 8_605, ambos: 8_705 },
    atividade: "ambos" as const,
    limiteAnual: R(81_000),
    alerta: 80_000,
    inicioAtividade: "2020-03",
  };
  it("DAS fixo conforme a atividade (2026)", () => {
    expect(calcularMei({ ...base, faturamentoAno: 0 }).das).toBe(8_705);
    expect(calcularMei({ ...base, atividade: "comercio", faturamentoAno: 0 }).das).toBe(8_205);
    expect(calcularMei({ ...base, atividade: "servicos", faturamentoAno: 0 }).das).toBe(8_605);
  });
  it("alerta a partir de 80% do limite de R$ 81 mil", () => {
    expect(calcularMei({ ...base, faturamentoAno: R(64_799) }).situacao).toBe("ok");
    expect(calcularMei({ ...base, faturamentoAno: R(64_800) })).toMatchObject({ situacao: "alerta", usoDoLimite: 80_000 });
    expect(calcularMei({ ...base, faturamentoAno: R(82_000) }).situacao).toBe("acima_do_limite");
    expect(calcularMei({ ...base, faturamentoAno: R(97_201) }).situacao).toBe("acima_20_porcento");
  });
  it("abriu no próprio ano: limite proporcional (R$ 6.750 por mês)", () => {
    const r = calcularMei({ ...base, inicioAtividade: "2026-04", faturamentoAno: R(50_000) });
    expect(r).toMatchObject({ limite: R(60_750), limiteProporcional: true, situacao: "alerta" });
  });
});

const P: ParametrosPresumido = {
  presuncaoIrpjComercio: 8_000,
  presuncaoIrpjServico: 32_000,
  presuncaoCsllComercio: 12_000,
  presuncaoCsllServico: 32_000,
  irpj: 15_000,
  irpjAdicional: 10_000,
  irpjAdicionalLimiteMensal: R(20_000),
  csll: 9_000,
  pis: 650,
  cofins: 3_000,
  lc224LimiteAnual: R(5_000_000),
  lc224AcrescimoIrpj: 10_000,
  lc224AcrescimoCsll: 10_000,
};
const valor = (r: ReturnType<typeof calcularPresumido>, chave: string) => r.linhas.find((l) => l.chave === chave)?.valor;

describe("Lucro Presumido", () => {
  it("serviços: R$ 100 mil no mês, ISS 5%", () => {
    const r = calcularPresumido({ receitaComercio: 0, receitaServico: R(100_000), receitaAnoAntes: 0, issPcm: 5_000, icmsPcm: null, p: P });
    expect(r.baseIrpj).toBe(R(32_000)); // 32%
    expect(valor(r, "irpj")).toBe(R(4_800)); // 15%
    expect(valor(r, "irpj_adicional")).toBe(R(1_200)); // 10% de (32 mil − 20 mil)
    expect(valor(r, "csll")).toBe(R(2_880)); // 9% de 32 mil
    expect(valor(r, "pis")).toBe(R(650));
    expect(valor(r, "cofins")).toBe(R(3_000));
    expect(valor(r, "iss")).toBe(R(5_000));
    expect(r.total).toBe(R(17_530));
    expect(r.faltaAliquota).toEqual([]);
  });

  it("comércio: R$ 200 mil, ICMS 12% (sem adicional: base de R$ 16 mil)", () => {
    const r = calcularPresumido({ receitaComercio: R(200_000), receitaServico: 0, receitaAnoAntes: 0, issPcm: null, icmsPcm: 12_000, p: P });
    expect(r.baseIrpj).toBe(R(16_000));
    expect(r.baseCsll).toBe(R(24_000));
    expect(valor(r, "irpj_adicional")).toBe(0);
    expect(r.total).toBe(R(2_400 + 2_160 + 1_300 + 6_000 + 24_000));
  });

  it("sem alíquota de ISS/ICMS informada: calcula o resto e avisa", () => {
    const r = calcularPresumido({ receitaComercio: R(1_000), receitaServico: R(1_000), receitaAnoAntes: 0, issPcm: null, icmsPcm: null, p: P });
    expect(r.faltaAliquota).toEqual(["iss", "icms"]);
  });

  describe("LC 224/2025: presunção acrescida acima de R$ 5 milhões no ano", () => {
    it("só a parte que passa do limite tem acréscimo", () => {
      expect(excedenteNoMes(R(4_950_000), R(100_000), R(5_000_000))).toBe(R(50_000));
      expect(excedenteNoMes(R(5_200_000), R(100_000), R(5_000_000))).toBe(R(100_000));
      expect(excedenteNoMes(R(1_000_000), R(100_000), R(5_000_000))).toBe(0);
    });
    it("serviços: 32% sobre R$ 100 mil + 3,2% extra sobre os R$ 50 mil excedentes", () => {
      const r = calcularPresumido({ receitaComercio: 0, receitaServico: R(100_000), receitaAnoAntes: R(4_950_000), issPcm: 0, icmsPcm: null, p: P });
      expect(r.receitaAcimaLc224).toBe(R(50_000));
      expect(r.baseIrpj).toBe(R(33_600));
    });
    it("comércio + serviço: excedente dividido na proporção da receita do mês", () => {
      // 75 mil comércio + 25 mil serviço, todo o mês acima do limite:
      // base normal = 6.000 + 8.000 = 14.000; extra = 10% × (75k × 8% + 25k × 32%) = 1.400
      expect(basePresumida(R(75_000), R(25_000), R(100_000), 8_000, 32_000, 10_000)).toBe(R(15_400));
    });
    it("parâmetro zerado (antes da vigência) = sem acréscimo", () => {
      const r = calcularPresumido({ receitaComercio: 0, receitaServico: R(100_000), receitaAnoAntes: R(6_000_000), issPcm: 0, icmsPcm: null, p: { ...P, lc224AcrescimoIrpj: 0 } });
      expect(r.baseIrpj).toBe(R(32_000));
    });
  });

  it("trimestre: o adicional real usa R$ 60 mil no trimestre", () => {
    const mes = (servico: number) => calcularPresumido({ receitaComercio: 0, receitaServico: R(servico), receitaAnoAntes: 0, issPcm: 0, icmsPcm: null, p: P });
    // bases: 30 mil, 10 mil, 25 mil → soma 65 mil; adicional = 10% × 5 mil = 500
    const t = irpjCsllTrimestre([mes(93_750), mes(31_250), mes(78_125)], P);
    expect(t.baseIrpj).toBe(R(65_000));
    expect(t.adicional).toBe(R(500));
    // Na soma mensal o adicional seria 1.000 + 0 + 500 = 1.500: o trimestre corrige em −1.000
    expect(t.diferencaDaSomaMensal).toBe(R(-1_000));
  });
});
