/**
 * Testes contra um Postgres real (TEST_DATABASE_URL). Recria o schema a cada execução.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarConexao } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { categoriasDespesa, despesas, empresas, fontesReceita, vendas } from "@/db/schema";
import { carregarPainel } from "@/lib/servidor/painel";

const url = process.env.TEST_DATABASE_URL;
const { db, cliente } = criarConexao(url ?? "postgres://invalido");

async function novaEmpresa(nome: string) {
  return db.transaction(async (tx) => {
    const [e] = await tx.insert(empresas).values({ nome, atividade: "ambos", regime: "simples", anexoComercio: "I", anexoServicos: "III" }).returning();
    await criarPadroesDaEmpresa(tx, e.id, "ambos");
    const fontes = await tx.select().from(fontesReceita).where(eq(fontesReceita.empresaId, e.id));
    const cats = await tx.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, e.id));
    return {
      id: e.id,
      fonte: (nome: string) => fontes.find((f) => f.nome === nome)!.id,
      cat: (chave: string) => cats.find((c) => c.chaveSistema === chave)!.id,
    };
  });
}

let A: Awaited<ReturnType<typeof novaEmpresa>>;
let B: Awaited<ReturnType<typeof novaEmpresa>>;

beforeAll(async () => {
  if (!url) throw new Error("Defina TEST_DATABASE_URL para rodar os testes de banco");
  await cliente.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
  A = await novaEmpresa("Empresa A");
  B = await novaEmpresa("Empresa B");
});

afterAll(async () => {
  await cliente.end();
});

const venda = (e: typeof A, fonte: string, data: string, valor: number, extra: Partial<typeof vendas.$inferInsert> = {}) => ({
  empresaId: e.id, data, valorCentavos: valor, fonteReceitaId: e.fonte(fonte), formaPagamento: "pix" as const, status: "recebido" as const, dataRecebimento: data, ...extra,
});
const despesa = (e: typeof A, chave: string, data: string, valor: number, extra: Partial<typeof despesas.$inferInsert> = {}) => ({
  empresaId: e.id, data, valorCentavos: valor, categoriaId: e.cat(chave), status: "pago" as const, vencimento: data, pagoEm: data, ...extra,
});

describe("isolamento entre empresas (multiempresa)", () => {
  it("o banco recusa venda da empresa A usando fonte da empresa B", async () => {
    await expect(
      db.insert(vendas).values({ ...venda(A, "Loja física", "2026-10-01", 100), fonteReceitaId: B.fonte("Loja física") }),
    ).rejects.toThrow();
  });

  it("o banco recusa despesa da empresa A com categoria da empresa B", async () => {
    await expect(
      db.insert(despesas).values({ ...despesa(A, "outras", "2026-10-01", 100), categoriaId: B.cat("outras") }),
    ).rejects.toThrow();
  });

  it("o banco recusa valores zerados e despesa paga sem data de pagamento", async () => {
    await expect(db.insert(vendas).values(venda(A, "Site", "2026-10-01", 0))).rejects.toThrow();
    await expect(db.insert(despesas).values(despesa(A, "outras", "2026-10-01", 100, { pagoEm: null }))).rejects.toThrow();
  });

  it("cada empresa nova recebe as 8 categorias padrão", async () => {
    const cats = await db.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, A.id));
    expect(cats).toHaveLength(8);
    expect(cats.find((c) => c.chaveSistema === "impostos")?.entraNoLucro).toBe(false);
  });
});

describe("números do painel", () => {
  beforeAll(async () => {
    await db.insert(vendas).values([
      venda(A, "Loja física", "2026-10-03", 1_000_000), // R$ 10.000 recebido
      venda(A, "Site", "2026-10-10", 300_000), // R$ 3.000 recebido
      venda(A, "Serviços", "2026-10-15", 700_000, { status: "a_receber", dataRecebimento: "2026-11-15" }), // a receber
      venda(A, "Loja física", "2026-09-28", 50_000, { status: "recebido", dataRecebimento: "2026-10-02" }), // venda de set., caixa de out.
      venda(A, "Loja física", "2026-10-20", 999_999, { excluidoEm: new Date() }), // excluída
      venda(B, "Loja física", "2026-10-05", 12_345_600), // outra empresa
    ]);
    await db.insert(despesas).values([
      despesa(A, "mercadorias", "2026-10-04", 600_000), // variável, paga
      despesa(A, "contas_fixas", "2026-10-01", 400_000, { status: "a_pagar", vencimento: "2026-10-26", pagoEm: null }), // fixa, a pagar
      despesa(A, "pro_labore", "2026-10-05", 200_000), // fixa, paga
      despesa(A, "impostos", "2026-10-20", 90_000), // DAS: só caixa
      despesa(B, "outras", "2026-10-05", 5_000_000), // outra empresa
    ]);
  });

  it("calcula faturamento, despesas, lucro, margem e caixa só com dados da empresa", async () => {
    const p = await carregarPainel(db, A.id, "2026-10", "2026-10-22");
    expect(p.resumo.faturamento).toBe(2_000_000);
    expect(p.resumo.despesas).toBe(1_200_000); // DAS não entra no lucro
    expect(p.resumo.lucro).toBe(800_000);
    expect(p.resumo.margem).toBe(40_000); // 40%
    // Caixa: recebidas em out. (10.000 + 3.000 + 500 de setembro) − pagas em out. (6.000 + 2.000 + 900)
    expect(p.resumo.caixa).toEqual({ entradas: 1_350_000, saidas: 890_000, saldo: 460_000 });
  });

  it("ponto de equilíbrio usa fixas e variáveis do mês", async () => {
    const p = await carregarPainel(db, A.id, "2026-10", "2026-10-22");
    // fixas 6.000; variáveis 6.000 → contribuição 70% → PE = 6.000 / 0,7 = 8.571,43
    expect(p.resumo.pontoEquilibrio).toMatchObject({ tipo: "valor", valor: 857_143 });
  });

  it("participação das fontes", async () => {
    const p = await carregarPainel(db, A.id, "2026-10", "2026-10-22");
    expect(p.fontes.map((f) => [f.nome, f.participacao])).toEqual([
      ["Loja física", 50_000],
      ["Serviços", 35_000],
      ["Site", 15_000],
    ]);
  });

  it("gráfico traz 12 meses terminando no mês escolhido", async () => {
    const p = await carregarPainel(db, A.id, "2026-10", "2026-10-22");
    expect(p.grafico).toHaveLength(12);
    expect(p.grafico.at(-1)).toMatchObject({ mes: "2026-10", faturamento: 2_000_000, lucro: 800_000 });
    expect(p.grafico.at(-2)).toMatchObject({ mes: "2026-09", faturamento: 50_000 });
  });

  it("vence em 7 dias lista contas a pagar e a receber (inclusive atrasadas)", async () => {
    const p = await carregarPainel(db, A.id, "2026-10", "2026-10-22");
    expect(p.vencimentos.map((v) => [v.tipo, v.valor, v.atrasado])).toEqual([["pagar", 400_000, false]]);
    const depois = await carregarPainel(db, A.id, "2026-11", "2026-11-10");
    expect(depois.vencimentos.map((v) => [v.tipo, v.valor, v.atrasado])).toEqual([
      ["pagar", 400_000, true],
      ["receber", 700_000, false],
    ]);
  });

  it("empresa B não vê nada da A", async () => {
    const p = await carregarPainel(db, B.id, "2026-10", "2026-10-22");
    expect(p.resumo.faturamento).toBe(12_345_600);
    expect(p.resumo.despesas).toBe(5_000_000);
    expect(p.fontes).toHaveLength(1);
  });
});
