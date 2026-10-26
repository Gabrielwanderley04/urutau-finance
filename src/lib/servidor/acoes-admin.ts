"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type BancoDeDados, obterDb } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { empresaModulos, empresaUsuarios, empresas, sessoes, usuarios, type Modulo } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { TODOS_MODULOS, escolhasParaGravar } from "@/lib/perfis";
import { errosPorCampo, esquemaEmpresa, formParaObjeto } from "@/lib/validacao";
import { exigirSuperadmin } from "./acesso";
import { registrarAuditoria } from "./auditoria";
import { gerarSenhaProvisoria, hashSenha } from "./auth";

/**
 * Ações do painel Urutau. Cada uma começa por exigirSuperadmin e deixa rastro na auditoria.
 * Senhas provisórias aparecem uma única vez na tela e nunca vão para a auditoria.
 */

const esquemaPessoa = z.object({
  pessoaNome: z.string().trim().min(2, "Informe o nome").max(80),
  pessoaEmail: z.string().trim().toLowerCase().email("E-mail inválido"),
  papel: z.enum(["dono", "colaborador", "contador"]).default("dono"),
});

type Tx = Parameters<Parameters<BancoDeDados["transaction"]>[0]>[0];

/** Usa a conta existente com este e-mail ou cria uma com senha provisória. */
async function garantirUsuario(tx: Tx, nome: string, email: string) {
  const [existente] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (existente) return { id: existente.id, senha: null };
  const senha = gerarSenhaProvisoria();
  const [u] = await tx.insert(usuarios).values({ nome, email, senhaHash: await hashSenha(senha) }).returning({ id: usuarios.id });
  return { id: u.id, senha };
}

const avisoSenha = (email: string, senha: string | null) =>
  senha ? ` Conta nova para ${email}. Senha provisória: ${senha} (anote agora: ela não aparece de novo).` : ` ${email} já tinha conta e foi ligado à empresa.`;

export async function criarEmpresaAdmin(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const admin = await exigirSuperadmin();
  const valores = formParaObjeto(fd);
  const empresa = esquemaEmpresa.safeParse(valores);
  const pessoa = esquemaPessoa.safeParse(valores);
  if (!empresa.success || !pessoa.success)
    return { erros: { ...(empresa.success ? {} : errosPorCampo(empresa.error)), ...(pessoa.success ? {} : errosPorCampo(pessoa.error)) }, valores };

  const db = obterDb();
  const { empresaId, senha } = await db.transaction(async (tx) => {
    const [e] = await tx.insert(empresas).values(empresa.data).returning({ id: empresas.id });
    await criarPadroesDaEmpresa(tx, e.id, empresa.data.atividade, empresa.data.perfil);
    const u = await garantirUsuario(tx, pessoa.data.pessoaNome, pessoa.data.pessoaEmail);
    await tx.insert(empresaUsuarios).values({ empresaId: e.id, usuarioId: u.id, papel: "dono" });
    return { empresaId: e.id, senha: u.senha };
  });
  await registrarAuditoria(db, {
    empresaId,
    usuarioId: admin.id,
    ator: "admin",
    acao: "admin.criar_empresa",
    entidade: "empresa",
    entidadeId: empresaId,
    dados: { perfil: empresa.data.perfil, dono: pessoa.data.pessoaEmail },
  });
  revalidatePath("/admin");
  return { ok: `${empresa.data.nome} criada.${avisoSenha(pessoa.data.pessoaEmail, senha)}`, valores: {} };
}

export async function salvarModulos(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const admin = await exigirSuperadmin();
  const db = obterDb();
  const [empresa] = await db.select({ perfil: empresas.perfil }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  if (!empresa) return { erros: { _: "Empresa não encontrada." } };
  const marcados = new Set(TODOS_MODULOS.filter((m) => fd.get(`modulo_${m}`) === "on")) as Set<Modulo>;
  const gravar = escolhasParaGravar(empresa.perfil, marcados);
  await db.transaction(async (tx) => {
    await tx.delete(empresaModulos).where(eq(empresaModulos.empresaId, empresaId));
    if (gravar.length) await tx.insert(empresaModulos).values(gravar.map((g) => ({ empresaId, ...g })));
  });
  await registrarAuditoria(db, { empresaId, usuarioId: admin.id, ator: "admin", acao: "admin.modulos", dados: { ligados: [...marcados] } });
  revalidatePath(`/admin/empresas/${empresaId}`);
  revalidatePath(`/e/${empresaId}`, "layout");
  return { ok: "Módulos salvos." };
}

export async function adicionarPessoaAdmin(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const admin = await exigirSuperadmin();
  const valores = formParaObjeto(fd);
  const r = esquemaPessoa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [empresa] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
  if (!empresa) return { erros: { _: "Empresa não encontrada." }, valores };
  const u = await db.transaction(async (tx) => {
    const u = await garantirUsuario(tx, r.data.pessoaNome, r.data.pessoaEmail);
    await tx
      .insert(empresaUsuarios)
      .values({ empresaId, usuarioId: u.id, papel: r.data.papel })
      .onConflictDoUpdate({ target: [empresaUsuarios.empresaId, empresaUsuarios.usuarioId], set: { papel: r.data.papel } });
    return u;
  });
  await registrarAuditoria(db, {
    empresaId,
    usuarioId: admin.id,
    ator: "admin",
    acao: "admin.adicionar_pessoa",
    entidade: "usuario",
    entidadeId: u.id,
    dados: { email: r.data.pessoaEmail, papel: r.data.papel },
  });
  revalidatePath(`/admin/empresas/${empresaId}`);
  return { ok: `Pessoa adicionada.${avisoSenha(r.data.pessoaEmail, u.senha)}`, valores: {} };
}

/** Gera uma senha nova e derruba as sessões abertas da pessoa. Devolve a senha para mostrar uma vez. */
export async function redefinirSenhaAdmin(empresaId: string, usuarioId: string): Promise<{ erro?: string; senha?: string }> {
  const admin = await exigirSuperadmin();
  const db = obterDb();
  // Só redefine quem é membro da empresa aberta no painel (evita mexer em conta errada).
  const [membro] = await db
    .select({ id: empresaUsuarios.usuarioId })
    .from(empresaUsuarios)
    .where(and(eq(empresaUsuarios.empresaId, empresaId), eq(empresaUsuarios.usuarioId, usuarioId)))
    .limit(1);
  if (!membro) return { erro: "Esta pessoa não faz parte da empresa." };
  const senha = gerarSenhaProvisoria();
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ senhaHash: await hashSenha(senha) }).where(eq(usuarios.id, usuarioId));
    await tx.delete(sessoes).where(eq(sessoes.usuarioId, usuarioId));
  });
  await registrarAuditoria(db, { empresaId, usuarioId: admin.id, ator: "admin", acao: "admin.redefinir_senha", entidade: "usuario", entidadeId: usuarioId });
  return { senha };
}
