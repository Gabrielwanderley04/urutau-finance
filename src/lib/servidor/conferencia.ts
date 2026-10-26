import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { clientes, fontesReceita, vendas } from "@/db/schema";
import { registrarAuditoria } from "./auditoria";

/**
 * Caixa de conferência: vendas que entraram sozinhas (WhatsApp, agenda, balcão, site)
 * e esperam o check final do dono. Lançamentos manuais já nascem conferidos.
 */

const pendente = (empresaId: string) =>
  and(eq(vendas.empresaId, empresaId), isNull(vendas.conferidoEm), isNull(vendas.excluidoEm));

export async function contarParaConferir(db: BancoDeDados, empresaId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(vendas).where(pendente(empresaId));
  return n;
}

export async function listarParaConferir(db: BancoDeDados, empresaId: string) {
  return db
    .select({
      id: vendas.id,
      data: vendas.data,
      valor: vendas.valorCentavos,
      descricao: vendas.descricao,
      origem: vendas.origem,
      status: vendas.status,
      formaPagamento: vendas.formaPagamento,
      fonte: fontesReceita.nome,
      clienteId: clientes.id,
      cliente: clientes.nome,
      telefone: clientes.telefone,
      criadoEm: vendas.criadoEm,
    })
    .from(vendas)
    .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
    .leftJoin(clientes, and(eq(clientes.id, vendas.clienteId), eq(clientes.empresaId, vendas.empresaId)))
    .where(pendente(empresaId))
    .orderBy(asc(vendas.criadoEm));
}

/** Marca como conferida. Devolve false se a venda não existe, é de outra empresa ou já foi conferida. */
export async function conferirVenda(db: BancoDeDados, empresaId: string, vendaId: string, usuarioId: string) {
  const [v] = await db
    .update(vendas)
    .set({ conferidoEm: new Date(), conferidoPor: usuarioId })
    .where(and(eq(vendas.id, vendaId), pendente(empresaId)))
    .returning({ id: vendas.id, valor: vendas.valorCentavos, origem: vendas.origem });
  if (!v) return false;
  await registrarAuditoria(db, {
    empresaId,
    usuarioId,
    ator: "usuario",
    acao: "venda.conferir",
    entidade: "venda",
    entidadeId: v.id,
    dados: { valorCentavos: v.valor, origem: v.origem },
  });
  return true;
}
