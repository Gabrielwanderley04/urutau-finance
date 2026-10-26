"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { empresaUsuarios, empresas } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaEmpresa, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";
import { exigirUsuario } from "./auth";

export async function criarEmpresa(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = formParaObjeto(fd);
  const r = esquemaEmpresa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };

  const id = await obterDb().transaction(async (tx) => {
    const [e] = await tx.insert(empresas).values(r.data).returning({ id: empresas.id });
    await tx.insert(empresaUsuarios).values({ empresaId: e.id, usuarioId: usuario.id, papel: "dono" });
    await criarPadroesDaEmpresa(tx, e.id, r.data.atividade, r.data.perfil);
    return e.id;
  });
  redirect(`/e/${id}/painel`);
}

export async function atualizarEmpresa(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaEmpresa.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  await obterDb().update(empresas).set(r.data).where(eq(empresas.id, empresaId));
  revalidatePath(`/e/${empresaId}`, "layout");
  return { ok: "Dados da empresa salvos." };
}
