"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { categoriasDespesa, despesas, fontesReceita, vendas } from "@/db/schema";
import { hoje, mesDe } from "@/lib/datas";
import type { EstadoForm } from "@/lib/estado-form";
import { podeAlterarLancamento } from "@/lib/permissoes";
import { errosPorCampo, esquemaDespesa, esquemaVenda, formParaObjeto } from "@/lib/validacao";
import { type Contexto, exigirPermissao } from "./acesso";
import { clienteDaEmpresa } from "./clientes";

async function fonteDaEmpresa(empresaId: string, id: string) {
  const [f] = await obterDb()
    .select({ id: fontesReceita.id })
    .from(fontesReceita)
    .where(and(eq(fontesReceita.id, id), eq(fontesReceita.empresaId, empresaId)))
    .limit(1);
  return !!f;
}

async function categoriaDaEmpresa(empresaId: string, id: string) {
  const [c] = await obterDb()
    .select({ id: categoriasDespesa.id })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.id, id), eq(categoriasDespesa.empresaId, empresaId)))
    .limit(1);
  return !!c;
}

async function autorDaVenda(empresaId: string, id: string) {
  const [v] = await obterDb()
    .select({ criadoPor: vendas.criadoPor })
    .from(vendas)
    .where(and(eq(vendas.id, id), eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm)))
    .limit(1);
  return v;
}

async function autorDaDespesa(empresaId: string, id: string) {
  const [d] = await obterDb()
    .select({ criadoPor: despesas.criadoPor })
    .from(despesas)
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm)))
    .limit(1);
  return d;
}

function garantirAutoria(ctx: Contexto, existente: { criadoPor: string | null } | undefined) {
  if (!existente) throw new Error("Lançamento não encontrado.");
  if (!podeAlterarLancamento(ctx.papel, ctx.usuario.id, existente.criadoPor))
    throw new Error("Você só pode alterar os lançamentos que você fez.");
}

function revalidar(empresaId: string) {
  revalidatePath(`/e/${empresaId}`, "layout");
}

// ─── Vendas ──────────────────────────────────────────────────────────────────

export async function salvarVenda(
  empresaId: string,
  id: string | null,
  _: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaVenda.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  if (!(await fonteDaEmpresa(empresaId, r.data.fonteReceitaId)))
    return { erros: { fonteReceitaId: "Fonte de receita inválida" }, valores };
  if (r.data.clienteId && !(await clienteDaEmpresa(obterDb(), empresaId, r.data.clienteId)))
    return { erros: { clienteId: "Cliente inválido" }, valores };

  const dados = {
    data: r.data.data,
    valorCentavos: r.data.valor,
    descricao: r.data.descricao,
    fonteReceitaId: r.data.fonteReceitaId,
    formaPagamento: r.data.formaPagamento,
    status: r.data.status,
    dataRecebimento: r.data.dataRecebimento,
    clienteId: r.data.clienteId,
  };
  const db = obterDb();
  if (id) {
    garantirAutoria(ctx, await autorDaVenda(empresaId, id));
    await db.update(vendas).set(dados).where(and(eq(vendas.id, id), eq(vendas.empresaId, empresaId)));
  } else {
    await db.insert(vendas).values({ ...dados, empresaId, criadoPor: ctx.usuario.id });
  }
  revalidar(empresaId);
  redirect(`/e/${empresaId}/vendas?mes=${mesDe(r.data.data)}&salvo=1`);
}

export async function excluirVenda(empresaId: string, id: string) {
  const ctx = await exigirPermissao(empresaId, "lancar");
  garantirAutoria(ctx, await autorDaVenda(empresaId, id));
  await obterDb()
    .update(vendas)
    .set({ excluidoEm: new Date() })
    .where(and(eq(vendas.id, id), eq(vendas.empresaId, empresaId)));
  revalidar(empresaId);
  redirect(`/e/${empresaId}/vendas`);
}

export async function marcarVendaRecebida(empresaId: string, id: string) {
  const ctx = await exigirPermissao(empresaId, "lancar");
  garantirAutoria(ctx, await autorDaVenda(empresaId, id));
  await obterDb()
    .update(vendas)
    .set({ status: "recebido", dataRecebimento: hoje() })
    .where(and(eq(vendas.id, id), eq(vendas.empresaId, empresaId)));
  revalidar(empresaId);
}

// ─── Despesas ────────────────────────────────────────────────────────────────

export async function salvarDespesa(
  empresaId: string,
  id: string | null,
  _: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaDespesa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  if (!(await categoriaDaEmpresa(empresaId, r.data.categoriaId)))
    return { erros: { categoriaId: "Categoria inválida" }, valores };

  const dados = {
    data: r.data.data,
    valorCentavos: r.data.valor,
    descricao: r.data.descricao,
    categoriaId: r.data.categoriaId,
    status: r.data.status,
    vencimento: r.data.vencimento,
    pagoEm: r.data.pagoEm,
  };
  const db = obterDb();
  if (id) {
    garantirAutoria(ctx, await autorDaDespesa(empresaId, id));
    await db.update(despesas).set(dados).where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
  } else {
    await db.insert(despesas).values({ ...dados, empresaId, criadoPor: ctx.usuario.id });
  }
  revalidar(empresaId);
  redirect(`/e/${empresaId}/despesas?mes=${mesDe(r.data.data)}&salvo=1`);
}

export async function excluirDespesa(empresaId: string, id: string) {
  const ctx = await exigirPermissao(empresaId, "lancar");
  garantirAutoria(ctx, await autorDaDespesa(empresaId, id));
  await obterDb()
    .update(despesas)
    .set({ excluidoEm: new Date() })
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
  revalidar(empresaId);
  redirect(`/e/${empresaId}/despesas`);
}

export async function marcarDespesaPaga(empresaId: string, id: string) {
  const ctx = await exigirPermissao(empresaId, "lancar");
  garantirAutoria(ctx, await autorDaDespesa(empresaId, id));
  await obterDb()
    .update(despesas)
    .set({ status: "pago", pagoEm: hoje() })
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, empresaId)));
  revalidar(empresaId);
}
