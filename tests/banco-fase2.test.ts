/**
 * Folha e dívidas contra um Postgres real: geração da folha, congelamento do passado,
 * e o efeito de juros, amortização e provisões no lucro, no caixa e no saldo devedor.
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarConexao } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { dividas, empresaParametros, empresas, folhaMensal, funcionarios, parcelasDivida } from "@/db/schema";
import { gerarCronograma } from "@/lib/calculos/dividas";
import { calcularCustoFuncionario } from "@/lib/calculos/folha";
import { limparFolhaAberta, sincronizarFolha } from "@/lib/servidor/folha";
import { carregarPainel } from "@/lib/servidor/painel";

const url = process.env.TEST_DATABASE_URL;
const { db, cliente } = criarConexao(url ?? "postgres://invalido");
const ALIQ = { fgts: 8_000, inssPatronal: 20_000, rat: 2_000, terceiros: 5_800, meiCpp: 3_000 };
const SEM_BENEFICIOS = { valeTransporte: 0, valeRefeicao: 0, planoSaude: 0, outros: 0 };

async function novaEmpresa(regime: "simples" | "presumido", anexoServicos: "III" | "IV" | null = null) {
  const [e] = await db.insert(empresas).values({ nome: `Teste ${regime}`, atividade: "servicos", regime, anexoServicos }).returning();
  await db.transaction((tx) => criarPadroesDaEmpresa(tx, e.id, "servicos"));
  return e;
}

beforeAll(async () => {
  if (!url) throw new Error("Defina TEST_DATABASE_URL");
  await cliente.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await cliente.end();
});

describe("folha mensal", () => {
  it("gera a folha a partir de folha_desde, proporcional no mês de admissão", async () => {
    const e = await novaEmpresa("simples", "III");
    const [f] = await db
      .insert(funcionarios)
      .values({ empresaId: e.id, nome: "Ana", salarioBrutoCentavos: 300_000, admissao: "2026-09-16", folhaDesde: "2026-08" })
      .returning();
    await sincronizarFolha(db, e, "2026-10", "2026-10");
    const linhas = await db.select().from(folhaMensal).where(eq(folhaMensal.funcionarioId, f.id));
    expect(linhas.map((l) => [l.competencia, l.diasTrabalhados, l.salario]).sort()).toEqual([
      ["2026-09", 15, 150_000],
      ["2026-10", 30, 300_000],
    ]);
    const out = linhas.find((l) => l.competencia === "2026-10")!;
    expect(out.custoTotal).toBe(calcularCustoFuncionario(300_000, SEM_BENEFICIOS, "nenhum", ALIQ).total);
    expect(out.inssPatronal).toBe(0); // Simples Anexo III
    expect(out.vencimento).toBe("2026-11-05");
  });

  it("é idempotente e não gera meses futuros", async () => {
    const e = await novaEmpresa("simples", "III");
    await db.insert(funcionarios).values({ empresaId: e.id, nome: "Bia", salarioBrutoCentavos: 200_000, admissao: "2025-01-01", folhaDesde: "2026-09" });
    await sincronizarFolha(db, e, "2026-12", "2026-10");
    await sincronizarFolha(db, e, "2026-12", "2026-10");
    const linhas = await db.select().from(folhaMensal).where(eq(folhaMensal.empresaId, e.id));
    expect(linhas.map((l) => l.competencia).sort()).toEqual(["2026-09", "2026-10"]);
  });

  it("aumento de salário vale do mês aberto em diante; o passado fica congelado", async () => {
    const e = await novaEmpresa("simples", "III");
    const [f] = await db
      .insert(funcionarios)
      .values({ empresaId: e.id, nome: "Caio", salarioBrutoCentavos: 200_000, admissao: "2025-01-01", folhaDesde: "2026-09" })
      .returning();
    await sincronizarFolha(db, e, "2026-10", "2026-10");
    await db.update(funcionarios).set({ salarioBrutoCentavos: 250_000 }).where(eq(funcionarios.id, f.id));
    await limparFolhaAberta(db, e.id, f.id, "2026-10");
    await sincronizarFolha(db, e, "2026-10", "2026-10");
    const linhas = await db.select().from(folhaMensal).where(eq(folhaMensal.funcionarioId, f.id));
    expect(Object.fromEntries(linhas.map((l) => [l.competencia, l.salario]))).toEqual({ "2026-09": 200_000, "2026-10": 250_000 });
  });

  it("Lucro Presumido inclui encargos patronais, e o RAT da empresa sobrescreve o padrão", async () => {
    const e = await novaEmpresa("presumido");
    await db.insert(empresaParametros).values({ empresaId: e.id, chave: "rat", valor: 1_000, vigenciaInicio: "2026-01-01" });
    const [f] = await db
      .insert(funcionarios)
      .values({ empresaId: e.id, nome: "Davi", salarioBrutoCentavos: 200_000, admissao: "2025-01-01", folhaDesde: "2026-10" })
      .returning();
    await sincronizarFolha(db, e, "2026-10", "2026-10");
    const [l] = await db.select().from(folhaMensal).where(eq(folhaMensal.funcionarioId, f.id));
    const esperado = calcularCustoFuncionario(200_000, SEM_BENEFICIOS, "completos", { ...ALIQ, rat: 1_000 });
    expect(l.inssPatronal).toBe(esperado.inssPatronal);
    expect(l.rat).toBe(esperado.rat); // 1%, não 2%
    expect(l.custoTotal).toBe(esperado.total);
  });
});

describe("painel com folha e dívidas", () => {
  let e: Awaited<ReturnType<typeof novaEmpresa>>;
  const crono = gerarCronograma({ saldoDevedor: 1_000_000, jurosMensais: 2_000, numParcelas: 12, primeiroVencimento: "2026-09-10", diaVencimento: 10 });

  beforeAll(async () => {
    e = await novaEmpresa("simples", "III");
    await db.insert(funcionarios).values({ empresaId: e.id, nome: "Eva", salarioBrutoCentavos: 200_000, admissao: "2025-01-01", folhaDesde: "2026-09" });
    await sincronizarFolha(db, e, "2026-10", "2026-10");
    // Folha de setembro paga em 05/10
    await db
      .update(folhaMensal)
      .set({ status: "pago", pagoEm: "2026-10-05" })
      .where(and(eq(folhaMensal.empresaId, e.id), eq(folhaMensal.competencia, "2026-09")));

    const [d] = await db
      .insert(dividas)
      .values({ empresaId: e.id, credor: "Banco", tipo: "emprestimo", valorOriginalCentavos: 1_000_000, saldoDevedorCentavos: 1_000_000, jurosMensaisPcm: 2_000, numParcelas: 12, valorParcelaCentavos: crono.valorParcela, diaVencimento: 10, primeiroVencimento: "2026-09-10" })
      .returning();
    await db.insert(parcelasDivida).values(
      crono.parcelas.map((p) => ({ empresaId: e.id, dividaId: d.id, ...p, status: p.numero <= 2 ? ("pago" as const) : ("a_pagar" as const), pagoEm: p.numero <= 2 ? p.vencimento : null })),
    );
  });

  it("lucro desconta custo da folha (com provisões) e só os juros da parcela", async () => {
    const p = await carregarPainel(db, e, "2026-10", "2026-10-22");
    const custo = calcularCustoFuncionario(200_000, SEM_BENEFICIOS, "nenhum", ALIQ);
    expect(p.resumo.folha).toBe(custo.total);
    expect(p.resumo.juros).toBe(crono.parcelas[1].juros); // parcela 2 vence em 10/10
    expect(p.resumo.despesas).toBe(custo.total + crono.parcelas[1].juros);
    expect(p.resumo.lucro).toBe(-(custo.total + crono.parcelas[1].juros));
  });

  it("caixa inclui a parcela inteira (juros + amortização) e a folha paga sem provisões", async () => {
    const p = await carregarPainel(db, e, "2026-10", "2026-10-22");
    const custo = calcularCustoFuncionario(200_000, SEM_BENEFICIOS, "nenhum", ALIQ);
    expect(p.resumo.caixa.saidas).toBe(crono.parcelas[1].valor + custo.caixa);
  });

  it("saldo devedor no fim do mês e quanto vence no mês", async () => {
    const out = await carregarPainel(db, e, "2026-10", "2026-10-22");
    expect(out.dividas.saldo).toBe(crono.parcelas[1].saldoApos);
    expect(out.dividas.venceNoMes).toBe(crono.parcelas[1].valor);
    // Em setembro (antes de pagar a 2ª), o saldo era o da 1ª parcela
    const set = await carregarPainel(db, e, "2026-09", "2026-09-30");
    expect(set.dividas.saldo).toBe(crono.parcelas[0].saldoApos);
  });

  it("vencimentos trazem a parcela e a folha a pagar", async () => {
    const p = await carregarPainel(db, e, "2026-11", "2026-11-03");
    const descricoes = p.vencimentos.map((v) => v.descricao);
    expect(descricoes).toContain("Folha de pagamento de outubro de 2026");
    expect(p.vencimentos.find((v) => v.link.startsWith("dividas/"))).toMatchObject({ valor: crono.parcelas[2].valor, data: "2026-11-10" });
  });

  it("o banco recusa parcela em que valor ≠ juros + amortização", async () => {
    const [d] = await db.select().from(dividas).where(eq(dividas.empresaId, e.id));
    await expect(
      db.insert(parcelasDivida).values({ empresaId: e.id, dividaId: d.id, numero: 99, vencimento: "2027-12-10", valor: 100, juros: 10, amortizacao: 80, saldoApos: 0 }),
    ).rejects.toThrow();
  });

  it("dívida excluída some do painel", async () => {
    await db.update(dividas).set({ excluidoEm: new Date() }).where(eq(dividas.empresaId, e.id));
    const p = await carregarPainel(db, e, "2026-10", "2026-10-22");
    expect(p.resumo.juros).toBe(0);
    expect(p.dividas.saldo).toBe(0);
  });
});
