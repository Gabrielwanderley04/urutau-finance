"use server";

import { and, eq, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/db";
import { dividas, parcelasDivida } from "@/db/schema";
import { gerarCronograma } from "@/lib/calculos/dividas";
import { hoje } from "@/lib/datas";
import type { EstadoForm } from "@/lib/estado-form";
import { errosPorCampo, esquemaDivida, esquemaDividaDescricao, formParaObjeto } from "@/lib/validacao";
import { exigirPermissao } from "./acesso";

const revalidar = (empresaId: string) => revalidatePath(`/e/${empresaId}`, "layout");

export async function criarDivida(empresaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaDivida.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const v = r.data;

  const cronograma = gerarCronograma({
    saldoDevedor: v.valorOriginal,
    jurosMensais: v.juros,
    numParcelas: v.numParcelas,
    valorParcela: v.valorParcela || null,
    primeiroVencimento: v.primeiroVencimento,
    diaVencimento: Number(v.primeiroVencimento.slice(8)),
  });
  if (cronograma.avisos.some((a) => a.tipo === "parcela_menor_que_juros"))
    return { erros: { valorParcela: "A parcela não cobre nem os juros do mês: a dívida nunca terminaria. Confira o valor." }, valores };

  const hojeData = hoje();
  const id = await obterDb().transaction(async (tx) => {
    const [d] = await tx
      .insert(dividas)
      .values({
        empresaId,
        credor: v.credor,
        tipo: v.tipo,
        valorOriginalCentavos: v.valorOriginal,
        saldoDevedorCentavos: v.valorOriginal,
        jurosMensaisPcm: v.juros,
        numParcelas: cronograma.parcelas.length,
        valorParcelaCentavos: cronograma.valorParcela,
        parcelaInformada: !!v.valorParcela,
        diaVencimento: Number(v.primeiroVencimento.slice(8)),
        primeiroVencimento: v.primeiroVencimento,
        observacao: v.observacao,
      })
      .returning({ id: dividas.id });
    await tx.insert(parcelasDivida).values(
      cronograma.parcelas.map((p) => {
        const paga = v.vencidasPagas && p.vencimento < hojeData;
        return { empresaId, dividaId: d.id, ...p, status: paga ? ("pago" as const) : ("a_pagar" as const), pagoEm: paga ? p.vencimento : null };
      }),
    );
    return d.id;
  });
  revalidar(empresaId);
  redirect(`/e/${empresaId}/dividas/${id}?salvo=1`);
}

export async function atualizarDescricaoDivida(empresaId: string, id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirPermissao(empresaId, "gerenciar");
  const valores = formParaObjeto(fd);
  const r = esquemaDividaDescricao.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  await obterDb()
    .update(dividas)
    .set(r.data)
    .where(and(eq(dividas.id, id), eq(dividas.empresaId, empresaId), isNull(dividas.excluidoEm)));
  revalidar(empresaId);
  return { ok: "Dados salvos." };
}

export async function excluirDivida(empresaId: string, id: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(dividas)
    .set({ excluidoEm: new Date() })
    .where(and(eq(dividas.id, id), eq(dividas.empresaId, empresaId)));
  revalidar(empresaId);
  redirect(`/e/${empresaId}/dividas`);
}

export async function pagarParcela(empresaId: string, parcelaId: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(parcelasDivida)
    .set({ status: "pago", pagoEm: hoje() })
    .where(and(eq(parcelasDivida.id, parcelaId), eq(parcelasDivida.empresaId, empresaId), eq(parcelasDivida.status, "a_pagar")));
  revalidar(empresaId);
}

export async function desfazerPagamentoParcela(empresaId: string, parcelaId: string) {
  await exigirPermissao(empresaId, "gerenciar");
  await obterDb()
    .update(parcelasDivida)
    .set({ status: "a_pagar", pagoEm: null })
    .where(and(eq(parcelasDivida.id, parcelaId), eq(parcelasDivida.empresaId, empresaId)));
  revalidar(empresaId);
}

/** Marca como pagas todas as parcelas atrasadas de uma dívida (com data do vencimento). */
export async function pagarAtrasadas(empresaId: string, dividaId: string) {
  await exigirPermissao(empresaId, "gerenciar");
  const db = obterDb();
  const atrasadas = await db
    .select({ id: parcelasDivida.id, vencimento: parcelasDivida.vencimento })
    .from(parcelasDivida)
    .where(and(eq(parcelasDivida.dividaId, dividaId), eq(parcelasDivida.empresaId, empresaId), eq(parcelasDivida.status, "a_pagar"), lt(parcelasDivida.vencimento, hoje())));
  for (const p of atrasadas)
    await db.update(parcelasDivida).set({ status: "pago", pagoEm: p.vencimento }).where(eq(parcelasDivida.id, p.id));
  revalidar(empresaId);
}
