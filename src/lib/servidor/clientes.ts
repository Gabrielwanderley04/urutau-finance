import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { clientes, fontesReceita, vendas } from "@/db/schema";

/**
 * Consultas de clientes. Recebem o banco e o empresa_id explicitamente (e não a sessão)
 * porque o atendente do WhatsApp também vai usá-las, sem usuário logado.
 */

export async function listarClientes(db: BancoDeDados, empresaId: string, busca = "") {
  const termo = busca.trim();
  const digitos = termo.replace(/\D/g, "");
  return db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      telefone: clientes.telefone,
      origem: clientes.origem,
      // Colunas de fora escritas com o nome da tabela: sem isso o Postgres as lê como colunas de `v`.
      compras: sql<number>`(select count(*)::int from ${vendas} v where v.empresa_id = "clientes"."empresa_id" and v.cliente_id = "clientes"."id" and v.excluido_em is null)`,
    })
    .from(clientes)
    .where(
      and(
        eq(clientes.empresaId, empresaId),
        isNull(clientes.excluidoEm),
        termo
          ? or(ilike(clientes.nome, `%${termo}%`), digitos.length >= 4 ? ilike(clientes.telefone, `%${digitos}%`) : undefined)
          : undefined,
      ),
    )
    .orderBy(asc(clientes.nome))
    .limit(200);
}

export async function obterCliente(db: BancoDeDados, empresaId: string, id: string) {
  const [c] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
    .limit(1);
  return c;
}

export async function comprasDoCliente(db: BancoDeDados, empresaId: string, clienteId: string) {
  return db
    .select({ id: vendas.id, data: vendas.data, valor: vendas.valorCentavos, descricao: vendas.descricao, fonte: fontesReceita.nome, origem: vendas.origem })
    .from(vendas)
    .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
    .where(and(eq(vendas.empresaId, empresaId), eq(vendas.clienteId, clienteId), isNull(vendas.excluidoEm)))
    .orderBy(desc(vendas.data))
    .limit(50);
}

/** Para o seletor do formulário de venda. */
export async function opcoesDeClientes(db: BancoDeDados, empresaId: string) {
  return db
    .select({ id: clientes.id, nome: clientes.nome, telefone: clientes.telefone })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
    .orderBy(asc(clientes.nome))
    .limit(500);
}

export async function clienteDaEmpresa(db: BancoDeDados, empresaId: string, id: string) {
  return !!(await obterCliente(db, empresaId, id));
}

/**
 * Acha o cliente pelo telefone (já normalizado) ou cria um novo. É a porta de entrada do WhatsApp:
 * a mensagem chega com o número, e o nome vem do perfil do WhatsApp.
 */
export async function acharOuCriarPorTelefone(
  db: BancoDeDados,
  empresaId: string,
  telefone: string,
  nome: string,
  origem: (typeof clientes.$inferInsert)["origem"] = "whatsapp",
) {
  const filtro = and(eq(clientes.empresaId, empresaId), eq(clientes.telefone, telefone), isNull(clientes.excluidoEm));
  const [existente] = await db.select().from(clientes).where(filtro).limit(1);
  if (existente) return { cliente: existente, novo: false };
  const [criado] = await db
    .insert(clientes)
    .values({ empresaId, telefone, nome: nome.trim() || `Cliente ${telefone.slice(-4)}`, origem })
    .onConflictDoNothing()
    .returning();
  // Duas mensagens ao mesmo tempo: a outra criou primeiro.
  if (!criado) {
    const [outro] = await db.select().from(clientes).where(filtro).limit(1);
    return { cliente: outro, novo: false };
  }
  return { cliente: criado, novo: true };
}
