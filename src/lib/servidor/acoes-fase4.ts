"use server";

import { and, eq, gte, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { categoriasDespesa, despesas, despesasRecorrentes, funcionarios, pagamentosProvisao } from "@/db/schema";
import { intervaloDoMes, mesAtual, somarMeses } from "@/lib/datas";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaPagamentoProvisao, esquemaRecorrente, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";
import { sincronizarRecorrentes } from "./automaticos";

const revalidar = (empresaId: string) => revalidatePath(`/e/${empresaId}`, "layout");

/**
 * Apaga os lançamentos ainda não pagos de uma recorrência a partir do mês atual,
 * para serem gerados de novo com os dados novos. Meses passados e pagos não mudam.
 */
async function limparFuturosNaoPagos(empresaId: string, recorrenciaId: string) {
  await obterDb()
    .delete(despesas)
    .where(
      and(
        eq(despesas.empresaId, empresaId),
        like(despesas.referencia, `recorrente:${recorrenciaId}:%`),
        eq(despesas.status, "a_pagar"),
        gte(despesas.vencimento, intervaloDoMes(mesAtual()).inicio),
      ),
    );
}

export async function salvarRecorrente(empresaId: string, id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const ctx = await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaRecorrente.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [cat] = await db
    .select({ id: categoriasDespesa.id })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.id, r.data.categoriaId), eq(categoriasDespesa.empresaId, empresaId)));
  if (!cat) return { erros: { categoriaId: "Categoria inválida" }, valores };

  const dados = {
    descricao: r.data.descricao,
    valorCentavos: r.data.valor,
    categoriaId: r.data.categoriaId,
    diaVencimento: r.data.diaVencimento,
    inicio: r.data.inicio,
    fim: r.data.fim,
  };
  if (id) {
    await db.update(despesasRecorrentes).set(dados).where(and(eq(despesasRecorrentes.id, id), eq(despesasRecorrentes.empresaId, empresaId)));
    await limparFuturosNaoPagos(empresaId, id);
  } else {
    await db.insert(despesasRecorrentes).values({ ...dados, empresaId, criadoPor: ctx.usuario.id });
  }
  await sincronizarRecorrentes(db, empresaId, ateMes());
  revalidar(empresaId);
  redirect(`/e/${empresaId}/despesas/recorrentes?salvo=1`);
}

export async function alternarRecorrente(empresaId: string, id: string, ativo: boolean) {
  await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  await db.update(despesasRecorrentes).set({ ativo }).where(and(eq(despesasRecorrentes.id, id), eq(despesasRecorrentes.empresaId, empresaId)));
  if (!ativo) await limparFuturosNaoPagos(empresaId, id);
  else await sincronizarRecorrentes(db, empresaId, ateMes());
  revalidar(empresaId);
}

/** As recorrentes são geradas até o mês seguinte, como em prepararEmpresa. */
const ateMes = () => somarMeses(mesAtual(), 1);

// ─── 13º e férias ────────────────────────────────────────────────────────────

export async function registrarPagamentoProvisao(empresaId: string, funcionarioId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaPagamentoProvisao.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const db = obterDb();
  const [f] = await db.select({ id: funcionarios.id }).from(funcionarios).where(and(eq(funcionarios.id, funcionarioId), eq(funcionarios.empresaId, empresaId)));
  if (!f) return { erros: { _: "Funcionário não encontrado." } };
  await db.insert(pagamentosProvisao).values({
    empresaId,
    funcionarioId,
    tipo: r.data.tipo,
    pagoEm: r.data.pagoEm,
    valorCentavos: r.data.valor,
    descricao: r.data.descricao,
  });
  revalidar(empresaId);
  return { ok: "Pagamento registrado. Ele entra no caixa do mês, mas não no lucro (já estava nas reservas)." };
}

export async function excluirPagamentoProvisao(empresaId: string, id: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb().delete(pagamentosProvisao).where(and(eq(pagamentosProvisao.id, id), eq(pagamentosProvisao.empresaId, empresaId)));
  revalidar(empresaId);
}
