import { describe, expect, it } from "vitest";
import type { ImpostoMes } from "@/lib/calculos/impostos";
import { obrigacoesDaCompetencia } from "@/lib/calculos/obrigacoes";
import { avos13, sugerirPagamento } from "@/lib/calculos/provisoes";
import { mesesDaRecorrencia } from "@/lib/calculos/recorrentes";
import { diaUtilAnterior, proximoDiaUtil, ultimoDiaUtil } from "@/lib/datas";
import { data, gerarCsv, reais, valorCsv } from "@/lib/relatorios/csv";

const ALIQ = { fgts: 8_000, inssPatronal: 20_000, rat: 2_000, terceiros: 5_800, meiCpp: 3_000 };

describe("dias úteis (sem feriados)", () => {
  it("fim de semana vai para segunda ou volta para sexta", () => {
    expect(proximoDiaUtil("2026-12-20")).toBe("2026-12-21"); // domingo → segunda
    expect(proximoDiaUtil("2026-10-20")).toBe("2026-10-20"); // terça
    expect(diaUtilAnterior("2026-07-25")).toBe("2026-07-24"); // sábado → sexta
    expect(ultimoDiaUtil("2026-10")).toBe("2026-10-30"); // 31/10 é sábado
  });
});

describe("guias de imposto como contas a pagar", () => {
  it("Simples: DAS dia 20 do mês seguinte (domingo 20/12 → segunda 21/12)", () => {
    const simples = { regime: "simples", total: 398_435, fixo: false } as ImpostoMes;
    expect(obrigacoesDaCompetencia("2026-11", simples)).toEqual([
      { referencia: "imposto:das:2026-11", descricao: "DAS de novembro de 2026", valor: 398_435, vencimento: "2026-12-21" },
    ]);
  });

  it("Presumido: PIS/Cofins dia 25, ISS e ICMS dia 10 e IRPJ/CSLL só no fim do trimestre", () => {
    const linhas = [
      { chave: "irpj", valor: 500_000 }, { chave: "irpj_adicional", valor: 100_000 }, { chave: "csll", valor: 300_000 },
      { chave: "pis", valor: 88_000 }, { chave: "cofins", valor: 407_000 }, { chave: "iss", valor: 282_000 }, { chave: "icms", valor: 167_000 },
    ];
    const lp = { regime: "presumido", total: 0, fixo: false, presumido: { linhas }, trimestre: { total: 2_800_000 } } as unknown as ImpostoMes;
    const out = obrigacoesDaCompetencia("2026-08", lp);
    expect(out.map((o) => [o.referencia, o.valor, o.vencimento])).toEqual([
      ["imposto:pis_cofins:2026-08", 495_000, "2026-09-25"],
      ["imposto:iss:2026-08", 282_000, "2026-09-10"],
      ["imposto:icms:2026-08", 167_000, "2026-09-10"],
    ]);
    const set = obrigacoesDaCompetencia("2026-09", lp);
    // 3º trimestre: vence no último dia útil de outubro (31/10 é sábado → 30/10)
    expect(set.at(-1)).toEqual({ referencia: "imposto:irpj_csll:2026-09", descricao: "IRPJ e CSLL do 3º trimestre de 2026", valor: 2_800_000, vencimento: "2026-10-30" });
  });

  it("Lucro Real e mês sem imposto não geram guia", () => {
    expect(obrigacoesDaCompetencia("2026-09", { regime: "real", total: null })).toEqual([]);
    expect(obrigacoesDaCompetencia("2026-09", { regime: "simples", total: 0, fixo: false } as ImpostoMes)).toEqual([]);
  });
});

describe("despesas recorrentes", () => {
  it("gera um lançamento por mês, com o dia ajustado nos meses curtos", () => {
    const r = { id: "abc", inicio: "2026-12", fim: null, diaVencimento: 31, ativo: true };
    expect(mesesDaRecorrencia(r, "2027-02")).toEqual([
      { mes: "2026-12", vencimento: "2026-12-31", referencia: "recorrente:abc:2026-12" },
      { mes: "2027-01", vencimento: "2027-01-31", referencia: "recorrente:abc:2027-01" },
      { mes: "2027-02", vencimento: "2027-02-28", referencia: "recorrente:abc:2027-02" },
    ]);
  });
  it("respeita o fim e o status ativo", () => {
    expect(mesesDaRecorrencia({ id: "x", inicio: "2026-01", fim: "2026-02", diaVencimento: 10, ativo: true }, "2026-12")).toHaveLength(2);
    expect(mesesDaRecorrencia({ id: "x", inicio: "2026-01", fim: null, diaVencimento: 10, ativo: false }, "2026-12")).toEqual([]);
  });
});

describe("13º e férias", () => {
  it("avos do 13º: mês com 15 dias ou mais de trabalho conta", () => {
    expect(avos13(2026, "2020-01-01", null)).toBe(12);
    expect(avos13(2026, "2026-03-16", null)).toBe(10); // março com 16 dias conta
    expect(avos13(2026, "2026-03-18", null)).toBe(9); // março com 14 dias não conta
    expect(avos13(2026, "2020-01-01", "2026-06-10")).toBe(5);
  });
  it("13º integral no Simples: salário + FGTS", () => {
    expect(sugerirPagamento("decimo_terceiro", 300_000, 12, "nenhum", ALIQ)).toEqual({ bruto: 300_000, fgts: 24_000, encargos: 0, total: 324_000 });
  });
  it("13º proporcional com encargos (Presumido)", () => {
    // 2.000 × 9/12 = 1.500; FGTS 120; encargos 27,8% = 417
    expect(sugerirPagamento("decimo_terceiro", 200_000, 9, "completos", ALIQ)).toEqual({ bruto: 150_000, fgts: 12_000, encargos: 41_700, total: 203_700 });
  });
  it("férias: salário + 1/3", () => {
    expect(sugerirPagamento("ferias", 300_000, 0, "nenhum", ALIQ)).toMatchObject({ bruto: 400_000, total: 432_000 });
  });
});

describe("CSV para o Excel brasileiro", () => {
  it("usa ponto e vírgula, vírgula decimal, datas dd/mm/aaaa e BOM", () => {
    const csv = gerarCsv(["Data", "Descrição", "Valor"], [[data("2026-10-05"), "Venda; balcão", reais(123_456)], [data(null), 'Diz "oi"', reais(-5)]]);
    expect(csv).toBe('﻿Data;Descrição;Valor\r\n05/10/2026;"Venda; balcão";1234,56\r\n;"Diz ""oi""";-0,05\r\n');
  });
  it("neutraliza fórmulas (CSV injection), mas não números negativos", () => {
    expect(gerarCsv(["a"], [["=HYPERLINK(1)"], ["-12,50"], ["+55 31 9999"]])).toBe("﻿a\r\n'=HYPERLINK(1)\r\n-12,50\r\n'+55 31 9999\r\n");
  });
  it("valor sem separador de milhar", () => {
    expect(valorCsv(100_000_000)).toBe("1000000,00");
  });
});
