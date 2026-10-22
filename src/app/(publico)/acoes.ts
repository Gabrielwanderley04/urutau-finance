"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { usuarios } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { conferirSenha, encerrarSessao, hashSenha, iniciarSessao } from "@/lib/servidor/auth";
import { errosPorCampo, esquemaCadastro, formParaObjeto } from "@/lib/validacao";

export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const email = (valores.email ?? "").trim().toLowerCase();
  const [u] = await obterDb().select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  // Mesma mensagem para e-mail inexistente e senha errada.
  if (!u || !(await conferirSenha(u.senhaHash, valores.senha ?? ""))) {
    return { erros: { _: "E-mail ou senha incorretos." }, valores: { email } };
  }
  await iniciarSessao(u.id);
  redirect("/empresas");
}

export async function criarConta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const valores = formParaObjeto(fd);
  const r = esquemaCadastro.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores: { nome: valores.nome, email: valores.email } };
  const db = obterDb();
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, r.data.email)).limit(1);
  if (existente) return { erros: { email: "Já existe uma conta com este e-mail." }, valores };
  const [u] = await db
    .insert(usuarios)
    .values({ nome: r.data.nome, email: r.data.email, senhaHash: await hashSenha(r.data.senha) })
    .returning({ id: usuarios.id });
  await iniciarSessao(u.id);
  redirect("/empresas/nova");
}

export async function sair() {
  await encerrarSessao();
  redirect("/entrar");
}
