"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/db";
import { categoriasDespesa, despesas, empresaUsuarios, fontesReceita, receitasHistoricas, usuarios, vendas } from "@/db/schema";
import { lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaCategoria, esquemaFonte, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";

type Resultado = { erro?: string } | void;

const revalidar = (empresaId: string) => revalidatePath(`/e/${empresaId}`, "layout");

// ─── Categorias ──────────────────────────────────────────────────────────────

export async function salvarCategoria(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const r = esquemaCategoria.safeParse(formParaObjeto(fd));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const db = obterDb();
  if (id) {
    await db.update(categoriasDespesa).set(r.data).where(and(eq(categoriasDespesa.id, id), eq(categoriasDespesa.empresaId, empresaId)));
  } else {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${categoriasDespesa.ordem}), 0)::int` })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.empresaId, empresaId));
    await db.insert(categoriasDespesa).values({ ...r.data, empresaId, ordem: max + 1 });
  }
  revalidar(empresaId);
  return { ok: id ? "Categoria salva." : "Categoria criada." };
}

export async function alternarCategoria(empresaId: string, id: string, ativo: boolean) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(categoriasDespesa)
    .set({ ativo })
    .where(and(eq(categoriasDespesa.id, id), eq(categoriasDespesa.empresaId, empresaId)));
  revalidar(empresaId);
}

/** Só exclui categoria criada pelo usuário e sem lançamentos; as demais podem ser desativadas. */
export async function excluirCategoria(empresaId: string, id: string): Promise<Resultado> {
  await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  const [uso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(despesas)
    .where(and(eq(despesas.empresaId, empresaId), eq(despesas.categoriaId, id)));
  if (uso.n > 0) return { erro: "Esta categoria tem lançamentos. Desative-a em vez de excluir." };
  await db
    .delete(categoriasDespesa)
    .where(and(eq(categoriasDespesa.id, id), eq(categoriasDespesa.empresaId, empresaId), isNull(categoriasDespesa.chaveSistema)));
  revalidar(empresaId);
}

// ─── Fontes de receita ───────────────────────────────────────────────────────

export async function salvarFonte(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const r = esquemaFonte.safeParse(formParaObjeto(fd));
  if (!r.success) return { erros: errosPorCampo(r.error) };
  const db = obterDb();
  if (id) {
    await db.update(fontesReceita).set(r.data).where(and(eq(fontesReceita.id, id), eq(fontesReceita.empresaId, empresaId)));
  } else {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${fontesReceita.ordem}), 0)::int` })
      .from(fontesReceita)
      .where(eq(fontesReceita.empresaId, empresaId));
    await db.insert(fontesReceita).values({ ...r.data, empresaId, ordem: max + 1 });
  }
  revalidar(empresaId);
  return { ok: id ? "Fonte salva." : "Fonte criada." };
}

export async function alternarFonte(empresaId: string, id: string, ativo: boolean) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(fontesReceita)
    .set({ ativo })
    .where(and(eq(fontesReceita.id, id), eq(fontesReceita.empresaId, empresaId)));
  revalidar(empresaId);
}

export async function excluirFonte(empresaId: string, id: string): Promise<Resultado> {
  await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  const [uso] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vendas)
    .where(and(eq(vendas.empresaId, empresaId), eq(vendas.fonteReceitaId, id)));
  if (uso.n > 0) return { erro: "Esta fonte tem vendas. Desative-a em vez de excluir." };
  await db.delete(fontesReceita).where(and(eq(fontesReceita.id, id), eq(fontesReceita.empresaId, empresaId)));
  revalidar(empresaId);
}

// ─── Usuários da empresa ─────────────────────────────────────────────────────

const esquemaMembro = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  papel: z.enum(["dono", "colaborador", "contador"]),
});

export async function adicionarMembro(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaMembro.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, r.data.email)).limit(1);
  if (!u)
    return {
      erros: { email: "Ninguém se cadastrou com este e-mail ainda. Peça para a pessoa criar uma conta e tente de novo." },
      valores,
    };
  await db
    .insert(empresaUsuarios)
    .values({ empresaId, usuarioId: u.id, papel: r.data.papel })
    .onConflictDoUpdate({ target: [empresaUsuarios.empresaId, empresaUsuarios.usuarioId], set: { papel: r.data.papel } });
  revalidar(empresaId);
  return { ok: "Pessoa adicionada." };
}

async function temOutroDono(empresaId: string, usuarioId: string) {
  const [{ n }] = await obterDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(empresaUsuarios)
    .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.papel, "dono"), ne(empresaUsuarios.usuarioId, usuarioId)));
  return n > 0;
}

const SEM_DONO = { erro: "A empresa precisa ter pelo menos um dono." };

export async function mudarPapel(empresaId: string, usuarioId: string, papel: "dono" | "colaborador" | "contador"): Promise<Resultado> {
  await exigirPermissao(empresaId, "gerenciar");
  if (papel !== "dono" && !(await temOutroDono(empresaId, usuarioId))) return SEM_DONO;
  await obterDb()
    .update(empresaUsuarios)
    .set({ papel })
    .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuarioId)));
  revalidar(empresaId);
}

export async function removerMembro(empresaId: string, usuarioId: string): Promise<Resultado> {
  await exigirPermissao(empresaId, "gerenciar");
  if (!(await temOutroDono(empresaId, usuarioId))) return SEM_DONO;
  await obterDb()
    .delete(empresaUsuarios)
    .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuarioId)));
  revalidar(empresaId);
}

// ─── Histórico de faturamento e folha (meses antes do urutau) ────────────────

export async function salvarHistorico(empresaId: string, meses: string[], _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const erros: Record<string, string> = {};
  const linhas: { competencia: string; receitaCentavos: number | null; folhaCentavos: number | null }[] = [];
  for (const mes of meses) {
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const ler = (campo: string) => {
      const bruto = String(fd.get(`${campo}_${mes}`) ?? "").trim();
      if (!bruto) return null;
      const c = lerReais(bruto);
      if (c === null || c < 0) erros[`${campo}_${mes}`] = "Valor inválido";
      return c;
    };
    linhas.push({ competencia: mes, receitaCentavos: ler("receita"), folhaCentavos: ler("folha") });
  }
  if (Object.keys(erros).length) return { erros, valores: formParaObjeto(fd) };

  const db = obterDb();
  await db.transaction(async (tx) => {
    for (const l of linhas) {
      const onde = and(eq(receitasHistoricas.empresaId, empresaId), eq(receitasHistoricas.competencia, l.competencia));
      if (l.receitaCentavos === null && l.folhaCentavos === null) {
        await tx.delete(receitasHistoricas).where(onde);
      } else {
        await tx
          .insert(receitasHistoricas)
          .values({ empresaId, ...l })
          .onConflictDoUpdate({
            target: [receitasHistoricas.empresaId, receitasHistoricas.competencia],
            set: { receitaCentavos: l.receitaCentavos, folhaCentavos: l.folhaCentavos },
          });
      }
    }
  });
  revalidar(empresaId);
  return { ok: "Histórico salvo. Os impostos já foram recalculados." };
}
