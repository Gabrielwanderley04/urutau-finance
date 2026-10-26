"use server";

import { revalidatePath } from "next/cache";
import { obterDb } from "@/db";
import { exigirPermissao } from "./acesso";
import { conferirVenda } from "./conferencia";

export async function conferir(empresaId: string, vendaId: string): Promise<{ erro?: string } | void> {
  const ctx = await exigirPermissao(empresaId, "conferir");
  const ok = await conferirVenda(obterDb(), empresaId, vendaId, ctx.usuario.id);
  revalidatePath(`/e/${empresaId}`, "layout");
  if (!ok) return { erro: "Esta venda já foi conferida ou foi excluída." };
}
