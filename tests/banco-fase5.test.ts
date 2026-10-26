/**
 * Fase 5 contra um Postgres real: clientes, caixa de conferência, auditoria e fila de tarefas.
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarConexao } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { auditoria, clientes, despesas, despesasRecorrentes, empresas, fontesReceita, categoriasDespesa, tarefas, vendas } from "@/db/schema";
import { listarEmpresasAdmin } from "@/lib/servidor/admin";
import { acharOuCriarPorTelefone, comprasDoCliente, listarClientes } from "@/lib/servidor/clientes";
import { conferirVenda, contarParaConferir, listarParaConferir } from "@/lib/servidor/conferencia";
import { MANIPULADORES, MAX_TENTATIVAS, agendarRotinasDiarias, enfileirar, processarTarefas } from "@/lib/servidor/tarefas";
import { mesAtual } from "@/lib/datas";

const url = process.env.TEST_DATABASE_URL;
const { db, cliente } = criarConexao(url ?? "postgres://invalido");

async function novaEmpresa(nome: string, perfil: "financas" | "revenda_veiculos" = "financas") {
  const [e] = await db.insert(empresas).values({ nome, atividade: "ambos", regime: "simples", anexoComercio: "I", anexoServicos: "III", perfil }).returning();
  await db.transaction((tx) => criarPadroesDaEmpresa(tx, e.id, e.atividade, perfil));
  const [fonte] = await db.select().from(fontesReceita).where(eq(fontesReceita.empresaId, e.id)).limit(1);
  return { ...e, fonteId: fonte.id };
}

let loja: Awaited<ReturnType<typeof novaEmpresa>>;
let outra: Awaited<ReturnType<typeof novaEmpresa>>;

beforeAll(async () => {
  if (!url) throw new Error("Defina TEST_DATABASE_URL");
  await cliente.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
  loja = await novaEmpresa("Urutau Veículos", "revenda_veiculos");
  outra = await novaEmpresa("Outra loja");
});

afterAll(async () => {
  await cliente.end();
});

const venda = (e: typeof loja, extra: Partial<typeof vendas.$inferInsert> = {}) => ({
  empresaId: e.id, data: "2026-10-20", valorCentavos: 200_000, fonteReceitaId: e.fonteId, formaPagamento: "pix" as const,
  status: "recebido" as const, dataRecebimento: "2026-10-20", ...extra,
});

describe("perfil da empresa", () => {
  it("a revenda nasce com as fontes de uma loja de carros", async () => {
    const fontes = await db.select({ nome: fontesReceita.nome }).from(fontesReceita).where(eq(fontesReceita.empresaId, loja.id));
    expect(fontes.map((f) => f.nome)).toEqual(["Venda de veículos", "Comissão de financiamento", "Despachante e documentação"]);
  });
});

describe("clientes", () => {
  it("o mesmo telefone não se repete na empresa, mas pode existir em outra", async () => {
    await db.insert(clientes).values({ empresaId: loja.id, nome: "Rafael", telefone: "5521998761234" });
    await expect(db.insert(clientes).values({ empresaId: loja.id, nome: "Rafael de novo", telefone: "5521998761234" })).rejects.toThrow();
    await expect(db.insert(clientes).values({ empresaId: outra.id, nome: "Rafael", telefone: "5521998761234" })).resolves.toBeDefined();
  });

  it("cliente excluído libera o telefone", async () => {
    const [c] = await db.insert(clientes).values({ empresaId: loja.id, nome: "Antigo", telefone: "5521911110000" }).returning();
    await db.update(clientes).set({ excluidoEm: new Date() }).where(eq(clientes.id, c.id));
    await expect(db.insert(clientes).values({ empresaId: loja.id, nome: "Novo dono do número", telefone: "5521911110000" })).resolves.toBeDefined();
  });

  it("o banco recusa telefone fora do formato", async () => {
    await expect(db.insert(clientes).values({ empresaId: loja.id, nome: "X", telefone: "(21) 9999-0000" })).rejects.toThrow();
  });

  it("acharOuCriarPorTelefone devolve o mesmo cliente nas mensagens seguintes, mesmo em paralelo", async () => {
    const [a, b] = await Promise.all([
      acharOuCriarPorTelefone(db, loja.id, "5521987654321", "Patrícia"),
      acharOuCriarPorTelefone(db, loja.id, "5521987654321", "Patrícia"),
    ]);
    expect(a.cliente.id).toBe(b.cliente.id);
    expect([a.novo, b.novo].filter(Boolean)).toHaveLength(1);
    const c = await acharOuCriarPorTelefone(db, loja.id, "5521987654321", "Outro nome");
    expect(c).toMatchObject({ novo: false, cliente: { nome: "Patrícia", origem: "whatsapp" } });
  });

  it("venda não pode apontar para cliente de outra empresa", async () => {
    const [deOutra] = await db.insert(clientes).values({ empresaId: outra.id, nome: "De outra" }).returning();
    await expect(db.insert(vendas).values(venda(loja, { clienteId: deOutra.id }))).rejects.toThrow();
  });

  it("busca por nome ou pelos dígitos do telefone, e mostra as compras", async () => {
    const [c] = await db.insert(clientes).values({ empresaId: loja.id, nome: "Lucas Andrade", telefone: "5521991112233" }).returning();
    await db.insert(vendas).values(venda(loja, { clienteId: c.id, descricao: "Corolla 2020" }));
    expect((await listarClientes(db, loja.id, "andrade")).map((x) => x.nome)).toEqual(["Lucas Andrade"]);
    expect((await listarClientes(db, loja.id, "1112233"))[0]).toMatchObject({ nome: "Lucas Andrade", compras: 1 });
    expect(await listarClientes(db, outra.id, "andrade")).toEqual([]);
    expect((await comprasDoCliente(db, loja.id, c.id)).map((v) => v.descricao)).toEqual(["Corolla 2020"]);
  });
});

describe("caixa de conferência", () => {
  it("venda lançada à mão já nasce conferida; a do WhatsApp espera o check", async () => {
    const antes = await contarParaConferir(db, loja.id);
    await db.insert(vendas).values(venda(loja));
    expect(await contarParaConferir(db, loja.id)).toBe(antes);
    const [w] = await db.insert(vendas).values(venda(loja, { origem: "whatsapp", conferidoEm: null, descricao: "Sinal Renegade" })).returning();
    expect(await contarParaConferir(db, loja.id)).toBe(antes + 1);
    expect((await listarParaConferir(db, loja.id)).map((v) => v.id)).toContain(w.id);
    expect(await contarParaConferir(db, outra.id)).toBe(0);
  });

  it("conferir marca quem conferiu, registra na auditoria e não confere duas vezes", async () => {
    const [w] = await db.insert(vendas).values(venda(loja, { origem: "whatsapp", conferidoEm: null })).returning();
    expect(await conferirVenda(db, loja.id, w.id, null as unknown as string)).toBe(true);
    expect(await conferirVenda(db, loja.id, w.id, null as unknown as string)).toBe(false);
    const [v] = await db.select().from(vendas).where(eq(vendas.id, w.id));
    expect(v.conferidoEm).not.toBeNull();
    const log = await db.select().from(auditoria).where(and(eq(auditoria.entidadeId, w.id), eq(auditoria.acao, "venda.conferir")));
    expect(log).toHaveLength(1);
  });

  it("não confere venda de outra empresa", async () => {
    const [w] = await db.insert(vendas).values(venda(outra, { origem: "whatsapp", conferidoEm: null })).returning();
    expect(await conferirVenda(db, loja.id, w.id, null as unknown as string)).toBe(false);
    expect(await contarParaConferir(db, outra.id)).toBe(1);
  });
});

describe("painel Urutau", () => {
  it("lista cada empresa com os próprios números", async () => {
    const terceira = await novaEmpresa("Terceira");
    await db.insert(vendas).values([venda(terceira, { origem: "whatsapp", conferidoEm: null }), venda(terceira, { origem: "site", conferidoEm: null }), venda(terceira)]);
    const lista = await listarEmpresasAdmin(db);
    const l = lista.find((e) => e.id === loja.id)!;
    const o = lista.find((e) => e.id === outra.id)!;
    expect(lista.find((e) => e.id === terceira.id)!.aConferir).toBe(2);
    expect(l.aConferir).toBe(await contarParaConferir(db, loja.id));
    expect(o.aConferir).toBe(await contarParaConferir(db, outra.id));
    expect([...l.modulos].sort()).toEqual(["agenda", "estoque", "financas", "whatsapp"]);
    expect([...o.modulos]).toEqual(["financas"]);
  });
});

describe("fila de tarefas", () => {
  it("a mesma chave não enfileira duas vezes", async () => {
    await enfileirar(db, { tipo: "teste", chave: "unica:1" });
    await enfileirar(db, { tipo: "teste", chave: "unica:1" });
    expect(await db.select().from(tarefas).where(eq(tarefas.chave, "unica:1"))).toHaveLength(1);
  });

  it("executa as pendentes, ignora as futuras e conclui", async () => {
    await db.delete(tarefas);
    const feitas: string[] = [];
    await enfileirar(db, { tipo: "anotar", dados: { n: "a" } });
    await enfileirar(db, { tipo: "anotar", dados: { n: "futura" }, executarEm: new Date(Date.now() + 3_600_000) });
    const r = await processarTarefas(db, { anotar: async (_, t) => void feitas.push(t.dados.n as string) });
    expect(r).toEqual({ concluidas: 1, falhas: 0 });
    expect(feitas).toEqual(["a"]);
    expect((await db.select().from(tarefas).where(eq(tarefas.status, "pendente"))).map((t) => t.dados.n)).toEqual(["futura"]);
  });

  it("dois processadores ao mesmo tempo não pegam a mesma tarefa", async () => {
    await db.delete(tarefas);
    for (let i = 0; i < 6; i++) await enfileirar(db, { tipo: "contar" });
    let n = 0;
    const contar = async () => {
      n++;
      await new Promise((r) => setTimeout(r, 20));
    };
    await Promise.all([processarTarefas(db, { contar }, 4), processarTarefas(db, { contar }, 4)]);
    expect(n).toBe(6);
  });

  it("falha volta para a fila com espera e desiste depois do limite", async () => {
    await db.delete(tarefas);
    await enfileirar(db, { tipo: "quebrada", chave: "quebrada" });
    const falhar = { quebrada: async () => { throw new Error("serviço fora do ar"); } };
    await processarTarefas(db, falhar);
    let [t] = await db.select().from(tarefas).where(eq(tarefas.chave, "quebrada"));
    expect(t).toMatchObject({ status: "pendente", tentativas: 1, ultimoErro: "serviço fora do ar" });
    expect(t.executarEm.getTime()).toBeGreaterThan(Date.now());
    for (let i = 1; i < MAX_TENTATIVAS; i++) {
      await db.update(tarefas).set({ executarEm: new Date(0) }).where(eq(tarefas.id, t.id));
      await processarTarefas(db, falhar);
    }
    [t] = await db.select().from(tarefas).where(eq(tarefas.chave, "quebrada"));
    expect(t).toMatchObject({ status: "falhou", tentativas: MAX_TENTATIVAS });
  });

  it("tipo desconhecido falha sem derrubar as outras", async () => {
    await db.delete(tarefas);
    await enfileirar(db, { tipo: "nao_existe" });
    await enfileirar(db, { tipo: "ok" });
    expect(await processarTarefas(db, { ok: async () => {} })).toEqual({ concluidas: 1, falhas: 1 });
  });

  it("a rotina diária gera as recorrentes de cada empresa, uma vez por dia", async () => {
    await db.delete(tarefas);
    const [cat] = await db.select().from(categoriasDespesa).where(and(eq(categoriasDespesa.empresaId, loja.id), eq(categoriasDespesa.chaveSistema, "contas_fixas")));
    await db.insert(despesasRecorrentes).values({ empresaId: loja.id, descricao: "Aluguel do pátio", valorCentavos: 750_000, categoriaId: cat.id, diaVencimento: 10, inicio: mesAtual() });
    const total = (await db.select({ id: empresas.id }).from(empresas)).length;
    expect(await agendarRotinasDiarias(db, "2026-10-26")).toBe(total);
    await agendarRotinasDiarias(db, "2026-10-26");
    expect(await db.select().from(tarefas)).toHaveLength(total);
    expect(await processarTarefas(db, MANIPULADORES)).toEqual({ concluidas: total, falhas: 0 });
    const geradas = await db.select().from(despesas).where(and(eq(despesas.empresaId, loja.id), eq(despesas.origem, "recorrente")));
    expect(geradas.length).toBeGreaterThanOrEqual(1);
    expect(geradas.every((d) => d.descricao === "Aluguel do pátio")).toBe(true);
  });
});
