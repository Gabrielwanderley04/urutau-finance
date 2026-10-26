import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { obterDb } from "@/db";
import { empresaModulos, empresaUsuarios, empresas, type Empresa, type Modulo, type Papel } from "@/db/schema";
import { modulosAtivos } from "@/lib/perfis";
import { type Acao, pode } from "@/lib/permissoes";
import { exigirUsuario, type UsuarioAtual } from "./auth";

export interface Contexto {
  usuario: UsuarioAtual;
  empresa: Empresa;
  papel: Papel;
  /** true quando quem entrou é da equipe Urutau sem ser membro da empresa. */
  comoAdmin: boolean;
  modulos: Set<Modulo>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const carregarContexto = cache(async (empresaId: string): Promise<Contexto> => {
  const usuario = await exigirUsuario();
  if (!UUID.test(empresaId)) notFound();
  const db = obterDb();
  const [[empresa], [membro], escolhas] = await Promise.all([
    db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1),
    db
      .select({ papel: empresaUsuarios.papel })
      .from(empresaUsuarios)
      .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuario.id)))
      .limit(1),
    db.select({ modulo: empresaModulos.modulo, ativo: empresaModulos.ativo }).from(empresaModulos).where(eq(empresaModulos.empresaId, empresaId)),
  ]);
  // Empresa de outra pessoa responde igual a uma inexistente: não revela que ela existe.
  // A equipe Urutau (superadmin) entra em qualquer empresa com os poderes do dono.
  if (!empresa || (!membro && !usuario.superadmin)) notFound();
  return {
    usuario,
    empresa,
    papel: membro?.papel ?? "dono",
    comoAdmin: !membro,
    modulos: modulosAtivos(empresa.perfil, escolhas),
  };
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

/** Para o painel Urutau: só a equipe Urutau passa; os outros recebem 404. */
export async function exigirSuperadmin(): Promise<UsuarioAtual> {
  const usuario = await exigirUsuario();
  if (!usuario.superadmin) notFound();
  return usuario;
}
