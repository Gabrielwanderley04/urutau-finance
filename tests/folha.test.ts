import { describe, expect, it } from "vitest";
import {
  type AliquotasFolha,
  beneficiosProporcionais,
  calcularCustoFuncionario,
  diasTrabalhados,
  encargosDoRegime,
  salarioProporcional,
} from "@/lib/calculos/folha";

const A: AliquotasFolha = { fgts: 8_000, inssPatronal: 20_000, rat: 2_000, terceiros: 5_800, meiCpp: 3_000 };
const B = { valeTransporte: 15_000, valeRefeicao: 40_000, planoSaude: 0, outros: 0 };

describe("encargos patronais por regime", () => {
  it("Simples I, II, III e V: já estão no DAS", () => {
    expect(encargosDoRegime("simples", null)).toBe("nenhum");
    expect(encargosDoRegime("simples", "III")).toBe("nenhum");
    expect(encargosDoRegime("simples", "V")).toBe("nenhum");
  });
  it("Simples Anexo IV, Presumido e Real: pagos à parte", () => {
    expect(encargosDoRegime("simples", "IV")).toBe("completos");
    expect(encargosDoRegime("presumido", null)).toBe("completos");
    expect(encargosDoRegime("real", null)).toBe("completos");
  });
  it("MEI com empregado: CPP de 3%", () => {
    expect(encargosDoRegime("mei", null)).toBe("mei_cpp");
  });
});

describe("custo real do funcionário (salário R$ 2.000, VT R$ 150, VR R$ 400)", () => {
  it("Simples Nacional (sem encargos patronais)", () => {
    const c = calcularCustoFuncionario(200_000, B, "nenhum", A);
    expect(c).toMatchObject({
      fgts: 16_000, // 8%
      provisao13: 16_667, // 2.000 ÷ 12 = 166,666…
      provisaoFerias: 22_222, // 2.000 ÷ 12 × 4/3 = 222,222…
      fgtsProvisoes: 3_111, // 8% × 388,89
      inssPatronal: 0,
      rat: 0,
      terceiros: 0,
      beneficios: 55_000,
      total: 313_000, // R$ 3.130,00
      caixa: 271_000, // sem provisões: 2.000 + 160 + 550
    });
  });

  it("Lucro Presumido (INSS 20%, RAT 2%, terceiros 5,8% sobre salário + provisões)", () => {
    const c = calcularCustoFuncionario(200_000, B, "completos", A);
    // base = 2.000 + 166,67 + 222,22 = 2.388,89
    expect(c.inssPatronal).toBe(47_778);
    expect(c.rat).toBe(4_778);
    expect(c.terceiros).toBe(13_856);
    expect(c.total).toBe(313_000 + 47_778 + 4_778 + 13_856); // R$ 3.794,12
    expect(c.caixa).toBe(271_000 + 40_000 + 4_000 + 11_600); // encargos só sobre o salário
  });

  it("MEI: CPP de 3%", () => {
    const c = calcularCustoFuncionario(200_000, B, "mei_cpp", A);
    expect(c.inssPatronal).toBe(7_167);
    expect(c.rat + c.terceiros).toBe(0);
    expect(c.total).toBe(320_167);
  });

  it("total é sempre a soma das parcelas exibidas", () => {
    for (const salario of [151_800, 162_100, 333_333, 1_234_567]) {
      for (const enc of ["nenhum", "completos", "mei_cpp"] as const) {
        const c = calcularCustoFuncionario(salario, B, enc, A);
        const soma = c.salario + c.fgts + c.provisao13 + c.provisaoFerias + c.fgtsProvisoes + c.inssPatronal + c.rat + c.terceiros + c.beneficios;
        expect(c.total).toBe(soma);
        expect(c.caixa).toBeLessThan(c.total);
      }
    }
  });

  it("alíquotas vêm de fora: mudar o FGTS muda o custo", () => {
    const c = calcularCustoFuncionario(100_000, { valeTransporte: 0, valeRefeicao: 0, planoSaude: 0, outros: 0 }, "nenhum", { ...A, fgts: 2_000 });
    expect(c.fgts).toBe(2_000); // 2% (ex.: aprendiz)
  });
});

describe("mês incompleto (mês comercial de 30 dias)", () => {
  it("mês cheio = 30 dias, inclusive fevereiro e meses de 31", () => {
    expect(diasTrabalhados("2026-02", "2025-01-10", null)).toBe(30);
    expect(diasTrabalhados("2026-03", "2025-01-10", null)).toBe(30);
  });
  it("admitido no meio do mês", () => {
    expect(diasTrabalhados("2026-03", "2026-03-16", null)).toBe(15);
    expect(diasTrabalhados("2026-02", "2026-02-15", null)).toBe(16);
  });
  it("desligado no meio do mês", () => {
    expect(diasTrabalhados("2026-04", "2025-01-01", "2026-04-10")).toBe(10);
  });
  it("fora do período: zero", () => {
    expect(diasTrabalhados("2026-04", "2026-05-01", null)).toBe(0);
    expect(diasTrabalhados("2026-06", "2025-01-01", "2026-05-31")).toBe(0);
  });
  it("salário e benefícios proporcionais (plano de saúde é mensal)", () => {
    expect(salarioProporcional(300_000, 15)).toBe(150_000);
    expect(salarioProporcional(300_000, 30)).toBe(300_000);
    expect(beneficiosProporcionais({ valeTransporte: 30_000, valeRefeicao: 60_000, planoSaude: 25_000, outros: 0 }, 10)).toEqual({
      valeTransporte: 10_000,
      valeRefeicao: 20_000,
      planoSaude: 25_000,
      outros: 0,
    });
  });
});
