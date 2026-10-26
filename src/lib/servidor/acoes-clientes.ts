"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { clientes } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaCliente, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";
import { registrarAuditoria } from "./auditoria";

const TELEFONE_REPETIDO = "Já existe um cliente com este telefone.";

function telefoneRepetido(e: unknown) {
  const causa = e instanceof Error && e.cause ? e.cause : e;
  return (causa as { constraint_name?: string })?.constraint_name === "clientes_telefone_uq";
}

export async function salvarCliente(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "lancar");
  const valores = formParaObjeto(fd);
  const r = esquemaCliente.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  let clienteId = id;
  try {
    if (id) {
      const [c] = await db
        .update(clientes)
        .set(r.data)
        .where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
        .returning({ id: clientes.id });
      if (!c) return { erros: { _: "Cliente não encontrado." }, valores };
    } else {
      const [c] = await db.insert(clientes).values({ ...r.data, empresaId, criadoPor: ctx.usuario.id }).returning({ id: clientes.id });
      clienteId = c.id;
    }
  } catch (e) {
    if (telefoneRepetido(e)) return { erros: { telefone: TELEFONE_REPETIDO }, valores };
    throw e;
  }
  revalidatePath(`/e/${empresaId}`, "layout");
  redirect(`/e/${empresaId}/clientes/${clienteId}?salvo=1`);
}

export async function excluirCliente(empresaId: string, id: string) {
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  // Exclusão lógica: as vendas continuam apontando para o cliente.
  const [c] = await db
    .update(clientes)
    .set({ excluidoEm: new Date() })
    .where(and(eq(clientes.id, id), eq(clientes.empresaId, empresaId), isNull(clientes.excluidoEm)))
    .returning({ id: clientes.id });
  if (c)
    await registrarAuditoria(db, { empresaId, usuarioId: ctx.usuario.id, ator: ctx.comoAdmin ? "admin" : "usuario", acao: "cliente.excluir", entidade: "cliente", entidadeId: id });
  revalidatePath(`/e/${empresaId}`, "layout");
  redirect(`/e/${empresaId}/clientes`);
}
