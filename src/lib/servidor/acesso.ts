import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { obterDb } from "@/db";
import { empresaUsuarios, empresas, type Empresa, type Papel } from "@/db/schema";
import { type Acao, pode } from "@/lib/permissoes";
import { exigirUsuario, type UsuarioAtual } from "./auth";

export interface Contexto {
  usuario: UsuarioAtual;
  empresa: Empresa;
  papel: Papel;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const carregarContexto = cache(async (empresaId: string): Promise<Contexto> => {
  const usuario = await exigirUsuario();
  if (!UUID.test(empresaId)) notFound();
  const [linha] = await obterDb()
    .select({ empresa: empresas, papel: empresaUsuarios.papel })
    .from(empresaUsuarios)
    .innerJoin(empresas, eq(empresas.id, empresaUsuarios.empresaId))
    .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuario.id)))
    .limit(1);
  // Empresa de outra pessoa responde igual a uma inexistente: não revela que ela existe.
  if (!linha) notFound();
  return { usuario, empresa: linha.empresa, papel: linha.papel };
});

/** Para páginas: sem permissão, manda para a tela inicial adequada ao papel. */
export async function exigirAcesso(empresaId: string, acao?: Acao): Promise<Contexto> {
  const ctx = await carregarContexto(empresaId);
  if (acao && !pode(ctx.papel, acao)) redirect(telaInicial(empresaId, ctx.papel));
  return ctx;
}

/** Para server actions: sem permissão, lança erro (nunca grava). */
export async function exigirPermissao(empresaId: string, acao: Acao): Promise<Contexto> {
  const ctx = await carregarContexto(empresaId);
  if (!pode(ctx.papel, acao)) throw new Error("Você não tem permissão para esta ação.");
  return ctx;
}

export function telaInicial(empresaId: string, papel: Papel) {
  return papel === "colaborador" ? `/e/${empresaId}/vendas` : `/e/${empresaId}/painel`;
}
