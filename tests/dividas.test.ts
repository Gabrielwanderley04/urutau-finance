import { describe, expect, it } from "vitest";
import { gerarCronograma, parcelaPrice, saldoDevedorEm, vencimentoParcela } from "@/lib/calculos/dividas";

describe("parcela pela tabela Price", () => {
  it("R$ 10.000 a 2% ao mês em 12x = R$ 945,60", () => {
    expect(parcelaPrice(1_000_000, 2_000, 12)).toBe(94_560);
  });
  it("R$ 30.000 a 2,1% ao mês em 24x", () => {
    const i = 0.021;
    const esperado = Math.round((3_000_000 * i) / (1 - (1 + i) ** -24));
    expect(parcelaPrice(3_000_000, 2_100, 24)).toBe(esperado);
  });
  it("sem juros: divide igualmente", () => {
    expect(parcelaPrice(100_000, 0, 3)).toBe(33_333);
  });
  it("prazo longo (120x) não perde precisão", () => {
    const i = 0.0149;
    expect(parcelaPrice(5_000_000, 1_490, 120)).toBe(Math.round((5_000_000 * i) / (1 - (1 + i) ** -120)));
  });
});

describe("cronograma: juros × amortização", () => {
  const c = gerarCronograma({ saldoDevedor: 1_000_000, jurosMensais: 2_000, numParcelas: 12, primeiroVencimento: "2026-01-10", diaVencimento: 10 });

  it("primeira parcela: juros = 2% do saldo, o resto amortiza", () => {
    expect(c.parcelas[0]).toMatchObject({ numero: 1, valor: 94_560, juros: 20_000, amortizacao: 74_560, saldoApos: 925_440 });
  });

  it("juros caem e amortização sobe a cada mês", () => {
    for (let k = 1; k < c.parcelas.length; k++) {
      expect(c.parcelas[k].juros).toBeLessThan(c.parcelas[k - 1].juros);
      expect(c.parcelas[k].amortizacao).toBeGreaterThan(c.parcelas[k - 1].amortizacao);
    }
  });

  it("a soma das amortizações é exatamente o saldo, e o saldo final é zero", () => {
    expect(c.parcelas.reduce((s, p) => s + p.amortizacao, 0)).toBe(1_000_000);
    expect(c.parcelas.at(-1)!.saldoApos).toBe(0);
    expect(c.parcelas.every((p) => p.valor === p.juros + p.amortizacao)).toBe(true);
  });

  it("última parcela absorve só centavos de arredondamento", () => {
    expect(Math.abs(c.parcelas.at(-1)!.valor - 94_560)).toBeLessThanOrEqual(12);
    expect(c.avisos).toEqual([]);
  });

  it("total de juros = total pago − saldo", () => {
    expect(c.totalJuros).toBe(c.parcelas.reduce((s, p) => s + p.valor, 0) - 1_000_000);
    expect(c.totalPago).toBe(1_000_000 + c.totalJuros);
  });

  it("fornecedor sem juros: R$ 1.000 em 3x = 333,33 + 333,33 + 333,34", () => {
    const f = gerarCronograma({ saldoDevedor: 100_000, jurosMensais: 0, numParcelas: 3, primeiroVencimento: "2026-01-05", diaVencimento: 5 });
    expect(f.parcelas.map((p) => p.valor)).toEqual([33_333, 33_333, 33_334]);
    expect(f.totalJuros).toBe(0);
  });

  it("usa o valor de parcela do contrato e avisa se não fechar com a taxa", () => {
    const k = gerarCronograma({ saldoDevedor: 1_000_000, jurosMensais: 2_000, numParcelas: 12, valorParcela: 90_000, primeiroVencimento: "2026-01-10", diaVencimento: 10 });
    expect(k.parcelas[0].valor).toBe(90_000);
    expect(k.parcelas.at(-1)!.saldoApos).toBe(0);
    expect(k.avisos[0]).toMatchObject({ tipo: "ajuste_ultima_parcela" });
  });

  it("parcela que não cobre os juros é sinalizada", () => {
    const k = gerarCronograma({ saldoDevedor: 1_000_000, jurosMensais: 5_000, numParcelas: 12, valorParcela: 40_000, primeiroVencimento: "2026-01-10", diaVencimento: 10 });
    expect(k.avisos.some((a) => a.tipo === "parcela_menor_que_juros")).toBe(true);
  });

  it("parcela maior que o necessário quita antes", () => {
    const k = gerarCronograma({ saldoDevedor: 100_000, jurosMensais: 0, numParcelas: 10, valorParcela: 30_000, primeiroVencimento: "2026-01-10", diaVencimento: 10 });
    expect(k.parcelas).toHaveLength(4);
    expect(k.parcelas.at(-1)!.valor).toBe(10_000);
    expect(k.avisos).toContainEqual({ tipo: "quitada_antes", parcelas: 4 });
  });
});

describe("vencimentos e saldo", () => {
  it("dia 31 cai no último dia dos meses curtos", () => {
    expect(vencimentoParcela("2026-01-31", 31, 1)).toBe("2026-02-28");
    expect(vencimentoParcela("2026-01-31", 31, 2)).toBe("2026-03-31");
    expect(vencimentoParcela("2026-11-10", 10, 2)).toBe("2027-01-10");
  });
  it("saldo devedor numa data considera o que já tinha sido pago até ali", () => {
    const parcelas = [
      { vencimento: "2026-01-10", valor: 110, amortizacao: 100, status: "pago" as const, pagoEm: "2026-01-10" },
      { vencimento: "2026-02-10", valor: 110, amortizacao: 100, status: "pago" as const, pagoEm: "2026-02-10" },
      { vencimento: "2026-03-10", valor: 110, amortizacao: 100, status: "a_pagar" as const, pagoEm: null },
    ];
    expect(saldoDevedorEm(parcelas, "2026-02-01")).toBe(200);
    expect(saldoDevedorEm(parcelas, "2026-03-01")).toBe(100);
  });
});
