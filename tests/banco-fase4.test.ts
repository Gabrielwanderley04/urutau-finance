/**
 * Fase 4 contra o banco real: despesas recorrentes, guias de imposto como contas a pagar,
 * pagamento de 13º (só caixa), agenda de contas e relatórios (CSV e PDF).
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarConexao } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { categoriasDespesa, despesas, despesasRecorrentes, empresas, fontesReceita, funcionarios, pagamentosProvisao, vendas } from "@/db/schema";
import { csvDaSecao } from "@/lib/relatorios/secoes";
import { gerarPdf } from "@/lib/relatorios/pdf";
import { gerarObrigacoesFiscais, sincronizarRecorrentes } from "@/lib/servidor/automaticos";
import { listarContas } from "@/lib/servidor/contas";
import { sincronizarFolha } from "@/lib/servidor/folha";
import { carregarPainel } from "@/lib/servidor/painel";
import { montarRelatorio } from "@/lib/servidor/relatorio";

const url = process.env.TEST_DATABASE_URL;
const { db, cliente } = criarConexao(url ?? "postgres://invalido");
const R = (reais: number) => Math.round(reais * 100);

beforeAll(async () => {
  if (!url) throw new Error("Defina TEST_DATABASE_URL");
  await cliente.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await cliente.end();
});

async function novaEmpresa() {
  const [e] = await db
    .insert(empresas)
    .values({ nome: "Loja Teste Ltda", atividade: "comercio", regime: "simples", anexoComercio: "I", inicioAtividade: "2015-01-01", criadoEm: new Date("2026-01-15T12:00:00Z") })
    .returning();
  await db.transaction((tx) => criarPadroesDaEmpresa(tx, e.id, "comercio"));
  const [fonte] = await db.select().from(fontesReceita).where(eq(fontesReceita.empresaId, e.id)).orderBy(fontesReceita.ordem).limit(1);
  const cats = await db.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, e.id));
  return { e, fonte: fonte.id, cat: (c: string) => cats.find((x) => x.chaveSistema === c)!.id };
}

describe("despesas recorrentes", () => {
  it("gera um lançamento por mês, sem duplicar, e respeita exclusões", async () => {
    const { e, cat } = await novaEmpresa();
    const [r] = await db
      .insert(despesasRecorrentes)
      .values({ empresaId: e.id, descricao: "Aluguel", valorCentavos: R(3_000), categoriaId: cat("contas_fixas"), diaVencimento: 10, inicio: "2026-09" })
      .returning();
    await sincronizarRecorrentes(db, e.id, "2026-11");
    await sincronizarRecorrentes(db, e.id, "2026-11");
    let lista = await db.select().from(despesas).where(eq(despesas.recorrenciaId, r.id));
    expect(lista.map((d) => d.vencimento).sort()).toEqual(["2026-09-10", "2026-10-10", "2026-11-10"]);
    expect(lista.every((d) => d.status === "a_pagar" && d.origem === "recorrente")).toBe(true);

    // O dono excluiu o aluguel de outubro (ex.: pago por fora): não volta a ser gerado.
    await db.update(despesas).set({ excluidoEm: new Date() }).where(and(eq(despesas.recorrenciaId, r.id), eq(despesas.vencimento, "2026-10-10")));
    await sincronizarRecorrentes(db, e.id, "2026-12");
    lista = await db.select().from(despesas).where(eq(despesas.recorrenciaId, r.id));
    expect(lista).toHaveLength(4);
    expect(lista.filter((d) => d.excluidoEm === null)).toHaveLength(3);
  });
});

describe("guias de imposto como contas a pagar", () => {
  it("o DAS do mês fechado vira conta a pagar no dia 20, só uma vez", async () => {
    const { e, fonte } = await novaEmpresa();
    await db.insert(vendas).values({ empresaId: e.id, fonteReceitaId: fonte, data: "2026-09-10", valorCentavos: R(10_000), formaPagamento: "pix", status: "recebido", dataRecebimento: "2026-09-10" });
    await gerarObrigacoesFiscais(db, e, "2026-10");
    await gerarObrigacoesFiscais(db, e, "2026-10");
    const guias = await db.select().from(despesas).where(and(eq(despesas.empresaId, e.id), eq(despesas.origem, "imposto")));
    // RBT12 até agosto = 0 → 1ª faixa do Anexo I (4%): R$ 400
    expect(guias.map((g) => [g.referencia, g.valorCentavos, g.vencimento, g.status])).toEqual([["imposto:das:2026-09", R(400), "2026-10-20", "a_pagar"]]);

    // Fica na agenda, mas não muda o lucro de outubro (categoria só caixa).
    const contas = await listarContas(db, e.id, "2026-10-15");
    expect(contas.find((c) => c.descricao.startsWith("DAS de setembro"))).toMatchObject({ valor: R(400), data: "2026-10-20" });
    const painel = await carregarPainel(db, e, "2026-10", "2026-10-15");
    expect(painel.resumo.despesas).toBe(0);
  });

  it("não gera quando o dono já lançou a guia à mão", async () => {
    const { e, fonte, cat } = await novaEmpresa();
    await db.insert(vendas).values({ empresaId: e.id, fonteReceitaId: fonte, data: "2026-09-10", valorCentavos: R(10_000), formaPagamento: "pix", status: "recebido", dataRecebimento: "2026-09-10" });
    await db.insert(despesas).values({ empresaId: e.id, data: "2026-10-20", valorCentavos: R(401), descricao: "DAS", categoriaId: cat("impostos"), status: "pago", vencimento: "2026-10-20", pagoEm: "2026-10-20" });
    await gerarObrigacoesFiscais(db, e, "2026-10");
    expect(await db.select().from(despesas).where(and(eq(despesas.empresaId, e.id), eq(despesas.origem, "imposto")))).toEqual([]);
  });
});

describe("13º e férias", () => {
  it("pagamento entra no caixa do mês, não no lucro", async () => {
    const { e } = await novaEmpresa();
    const [f] = await db.insert(funcionarios).values({ empresaId: e.id, nome: "Rita", salarioBrutoCentavos: R(2_000), admissao: "2024-01-01", folhaDesde: "2026-11" }).returning();
    await sincronizarFolha(db, e, "2026-11", "2026-11");
    const antes = await carregarPainel(db, e, "2026-11", "2026-11-30");
    await db.insert(pagamentosProvisao).values({ empresaId: e.id, funcionarioId: f.id, tipo: "decimo_terceiro", pagoEm: "2026-11-28", valorCentavos: R(1_080) });
    const depois = await carregarPainel(db, e, "2026-11", "2026-11-30");
    expect(depois.resumo.lucro).toBe(antes.resumo.lucro);
    expect(depois.resumo.caixa.saidas - antes.resumo.caixa.saidas).toBe(R(1_080));
  });
});

describe("relatório do mês", () => {
  it("CSV e PDF batem com o painel", async () => {
    const { e, fonte, cat } = await novaEmpresa();
    await db.insert(vendas).values([
      { empresaId: e.id, fonteReceitaId: fonte, data: "2026-10-03", valorCentavos: R(1_234.56), descricao: "Venda; com ponto e vírgula", formaPagamento: "pix", status: "recebido", dataRecebimento: "2026-10-03" },
      { empresaId: e.id, fonteReceitaId: fonte, data: "2026-10-20", valorCentavos: R(800), formaPagamento: "credito", status: "a_receber", dataRecebimento: "2026-11-19" },
    ]);
    await db.insert(despesas).values({ empresaId: e.id, data: "2026-10-05", valorCentavos: R(500), descricao: "Aluguel", categoriaId: cat("contas_fixas"), status: "pago", vencimento: "2026-10-05", pagoEm: "2026-10-05" });
    const r = await montarRelatorio(db, e, "2026-10", "2026-10-23");
    expect(r.painel.resumo.faturamento).toBe(R(2_034.56));

    const vendasCsv = csvDaSecao(r, "vendas");
    const linhas = vendasCsv.trim().split("\r\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe('03/10/2026;"Venda; com ponto e vírgula";Loja física;Comércio;Pix;Recebido;03/10/2026;1234,56');
    const soma = linhas.slice(1).reduce((t, l) => t + Math.round(Number(l.split(";").at(-1)!.replace(",", ".")) * 100), 0);
    expect(soma).toBe(r.painel.resumo.faturamento);

    const resumo = csvDaSecao(r, "resumo");
    expect(resumo).toContain(`Lucro líquido;${(r.painel.resumo.lucro / 100).toFixed(2).replace(".", ",")}`);
    expect(csvDaSecao(r, "impostos")).toContain("Valor estimado. Confirme com o seu contador.");

    const pdf = await gerarPdf(r);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(5_000);
  }, 30_000);
});
