import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { categoriasDespesa, despesas, fontesReceita, usuarios, vendas } from "@/db/schema";
import { type Mes, intervaloDoMes } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import type { Contexto } from "./acesso";

/** Colaborador enxerga só o que ele lançou. */
function filtroAutor<T extends typeof vendas | typeof despesas>(t: T, ctx: Contexto) {
  return pode(ctx.papel, "ver_todos_lancamentos") ? undefined : eq(t.criadoPor, ctx.usuario.id);
}

export async function listarFontes(empresaId: string, somenteAtivas = true) {
  return obterDb()
    .select()
    .from(fontesReceita)
    .where(and(eq(fontesReceita.empresaId, empresaId), somenteAtivas ? eq(fontesReceita.ativo, true) : undefined))
    .orderBy(asc(fontesReceita.ordem), asc(fontesReceita.nome));
}

export async function listarCategorias(empresaId: string, somenteAtivas = true) {
  return obterDb()
    .select()
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.empresaId, empresaId), somenteAtivas ? eq(categoriasDespesa.ativo, true) : undefined))
    .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome));
}

export async function listarVendasDoMes(ctx: Contexto, mes: Mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  return obterDb()
    .select({
      id: vendas.id,
      data: vendas.data,
      valor: vendas.valorCentavos,
      descricao: vendas.descricao,
      fonte: fontesReceita.nome,
      fonteId: fontesReceita.id,
      formaPagamento: vendas.formaPagamento,
      status: vendas.status,
      dataRecebimento: vendas.dataRecebimento,
      criadoPor: vendas.criadoPor,
      autor: usuarios.nome,
    })
    .from(vendas)
    .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
    .leftJoin(usuarios, eq(usuarios.id, vendas.criadoPor))
    .where(
      and(
        eq(vendas.empresaId, ctx.empresa.id),
        isNull(vendas.excluidoEm),
        gte(vendas.data, inicio),
        lt(vendas.data, fim),
        filtroAutor(vendas, ctx),
      ),
    )
    .orderBy(desc(vendas.data), desc(vendas.criadoEm));
}

export async function listarDespesasDoMes(ctx: Contexto, mes: Mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  return obterDb()
    .select({
      id: despesas.id,
      data: despesas.data,
      valor: despesas.valorCentavos,
      descricao: despesas.descricao,
      categoria: categoriasDespesa.nome,
      categoriaId: categoriasDespesa.id,
      entraNoLucro: categoriasDespesa.entraNoLucro,
      status: despesas.status,
      vencimento: despesas.vencimento,
      pagoEm: despesas.pagoEm,
      criadoPor: despesas.criadoPor,
      origem: despesas.origem,
    })
    .from(despesas)
    .innerJoin(
      categoriasDespesa,
      and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)),
    )
    .where(
      and(
        eq(despesas.empresaId, ctx.empresa.id),
        isNull(despesas.excluidoEm),
        gte(despesas.data, inicio),
        lt(despesas.data, fim),
        filtroAutor(despesas, ctx),
      ),
    )
    .orderBy(asc(categoriasDespesa.ordem), desc(despesas.data));
}

export async function obterVenda(ctx: Contexto, id: string) {
  const [v] = await obterDb()
    .select()
    .from(vendas)
    .where(and(eq(vendas.id, id), eq(vendas.empresaId, ctx.empresa.id), isNull(vendas.excluidoEm), filtroAutor(vendas, ctx)))
    .limit(1);
  return v ?? null;
}

export async function obterDespesa(ctx: Contexto, id: string) {
  const [d] = await obterDb()
    .select()
    .from(despesas)
    .where(and(eq(despesas.id, id), eq(despesas.empresaId, ctx.empresa.id), isNull(despesas.excluidoEm), filtroAutor(despesas, ctx)))
    .limit(1);
  return d ?? null;
}

/** Quantos lançamentos usam cada fonte/categoria (para impedir exclusão e avisar). */
export async function contarUsoFontes(empresaId: string) {
  const linhas = await obterDb()
    .select({ id: vendas.fonteReceitaId, n: sql<number>`count(*)::int` })
    .from(vendas)
    .where(and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm)))
    .groupBy(vendas.fonteReceitaId);
  return new Map(linhas.map((l) => [l.id, l.n]));
}

export async function contarUsoCategorias(empresaId: string) {
  const linhas = await obterDb()
    .select({ id: despesas.categoriaId, n: sql<number>`count(*)::int` })
    .from(despesas)
    .where(and(eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm)))
    .groupBy(despesas.categoriaId);
  return new Map(linhas.map((l) => [l.id, l.n]));
}
