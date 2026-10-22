"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { folhaMensal, funcionarios } from "@/db/schema";
import { hoje, mesAtual } from "@/lib/datas";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaFuncionario, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";
import { limparFolhaAberta, sincronizarFolha } from "./folha";

const revalidar = (empresaId: string) => revalidatePath(`/e/${empresaId}`, "layout");

export async function salvarFuncionario(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { empresa } = await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaFuncionario.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };

  const dados = {
    nome: r.data.nome,
    cargo: r.data.cargo,
    salarioBrutoCentavos: r.data.salario,
    admissao: r.data.admissao,
    desligamento: r.data.desligamento ?? null,
    vtCentavos: r.data.vt,
    vrCentavos: r.data.vr,
    planoSaudeCentavos: r.data.planoSaude,
    outrosBeneficiosCentavos: r.data.outros,
    folhaDesde: r.data.folhaDesde,
  };
  const db = obterDb();
  const atual = mesAtual();
  let funcionarioId = id;
  if (id) {
    const [f] = await db
      .update(funcionarios)
      .set(dados)
      .where(and(eq(funcionarios.id, id), eq(funcionarios.empresaId, empresaId), isNull(funcionarios.excluidoEm)))
      .returning({ id: funcionarios.id });
    if (!f) return { erros: { _: "Funcionário não encontrado." } };
    // Aumento vale a partir do mês aberto; meses anteriores já gerados não mudam.
    await limparFolhaAberta(db, empresaId, id, atual);
  } else {
    const [f] = await db.insert(funcionarios).values({ ...dados, empresaId }).returning({ id: funcionarios.id });
    funcionarioId = f.id;
  }
  await sincronizarFolha(db, empresa, atual, atual);
  revalidar(empresaId);
  redirect(`/e/${empresaId}/funcionarios/${funcionarioId}?salvo=1`);
}

export async function excluirFuncionario(empresaId: string, id: string) {
  await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  await db
    .update(funcionarios)
    .set({ excluidoEm: new Date() })
    .where(and(eq(funcionarios.id, id), eq(funcionarios.empresaId, empresaId)));
  // Meses já pagos ficam no histórico; os não pagos somem.
  await limparFolhaAberta(db, empresaId, id, mesAtual(), true);
  revalidar(empresaId);
  redirect(`/e/${empresaId}/funcionarios`);
}

/** Marca como paga a folha de um mês (todos os funcionários) ou de um funcionário. */
export async function pagarFolha(empresaId: string, competencia: string, funcionarioId?: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(folhaMensal)
    .set({ status: "pago", pagoEm: hoje() })
    .where(
      and(
        eq(folhaMensal.empresaId, empresaId),
        eq(folhaMensal.competencia, competencia),
        eq(folhaMensal.status, "a_pagar"),
        funcionarioId ? eq(folhaMensal.funcionarioId, funcionarioId) : undefined,
      ),
    );
  revalidar(empresaId);
}

export async function desfazerPagamentoFolha(empresaId: string, competencia: string, funcionarioId: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(folhaMensal)
    .set({ status: "a_pagar", pagoEm: null })
    .where(and(eq(folhaMensal.empresaId, empresaId), eq(folhaMensal.competencia, competencia), eq(folhaMensal.funcionarioId, funcionarioId)));
  revalidar(empresaId);
}
