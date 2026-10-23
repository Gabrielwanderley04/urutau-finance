import "server-only";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { type Empresa, categoriasDespesa, despesas, despesasRecorrentes } from "@/db/schema";
import { calcularImpostoMes } from "@/lib/calculos/impostos";
import { obrigacoesDaCompetencia } from "@/lib/calculos/obrigacoes";
import { mesesDaRecorrencia } from "@/lib/calculos/recorrentes";
import { type Mes, intervaloDoMes, mesAtual as mesDeHoje, somarMeses } from "@/lib/datas";
import { MESES_DE_HISTORICO, carregarSeries, carregarTabelasFiscais, empresaFiscal } from "./fiscal";
import { sincronizarFolha } from "./folha";

/**
 * Gera os lançamentos das despesas recorrentes até `ateMes`.
 * A referência única impede duplicar, inclusive quando o usuário exclui um lançamento gerado.
 */
export async function sincronizarRecorrentes(db: BancoDeDados, empresaId: string, ateMes: Mes) {
  const lista = await db
    .select()
    .from(despesasRecorrentes)
    .where(and(eq(despesasRecorrentes.empresaId, empresaId), eq(despesasRecorrentes.ativo, true)));
  const novos = lista.flatMap((r) =>
    mesesDaRecorrencia(r, ateMes).map((m) => ({
      empresaId,
      data: m.vencimento,
      valorCentavos: r.valorCentavos,
      descricao: r.descricao,
      categoriaId: r.categoriaId,
      status: "a_pagar" as const,
      vencimento: m.vencimento,
      origem: "recorrente" as const,
      recorrenciaId: r.id,
      referencia: m.referencia,
      criadoPor: r.criadoPor,
    })),
  );
  if (novos.length) await db.insert(despesas).values(novos).onConflictDoNothing({ target: [despesas.empresaId, despesas.referencia] });
}

/** Quantos meses fechados para trás geramos guias (se o dono ficar alguns meses sem abrir o sistema). */
const MESES_DE_GUIAS = 3;

/**
 * Ao fechar o mês, o imposto estimado vira conta a pagar na categoria "Impostos sobre vendas"
 * (conta só no caixa; o lucro já descontou a estimativa). O dono ajusta o valor quando a guia chegar.
 * Não gera para competências em que já existe guia lançada à mão (vencendo no mês seguinte).
 */
export async function gerarObrigacoesFiscais(db: BancoDeDados, empresa: Empresa, mesAtual: Mes) {
  if (empresa.regime === "real") return;
  const primeiroMes = somarMeses(mesAtual, -MESES_DE_GUIAS);
  const desdeCadastro = empresa.criadoEm.toISOString().slice(0, 7);
  const competencias: Mes[] = [];
  for (let m = primeiroMes > desdeCadastro ? primeiroMes : desdeCadastro; m < mesAtual; m = somarMeses(m, 1)) competencias.push(m);
  if (!competencias.length) return;

  const [categoria] = await db
    .select({ id: categoriasDespesa.id })
    .from(categoriasDespesa)
    .where(and(eq(categoriasDespesa.empresaId, empresa.id), eq(categoriasDespesa.chaveSistema, "impostos")));
  if (!categoria) return;

  // Guias lançadas à mão (sem referência) no período: aquela competência já está resolvida.
  const manuais = await db
    .select({ vencimento: despesas.vencimento })
    .from(despesas)
    .where(
      and(
        eq(despesas.empresaId, empresa.id),
        eq(despesas.categoriaId, categoria.id),
        isNull(despesas.referencia),
        isNull(despesas.excluidoEm),
        gte(despesas.vencimento, intervaloDoMes(somarMeses(competencias[0], 1)).inicio),
        lt(despesas.vencimento, intervaloDoMes(somarMeses(competencias.at(-1)!, 1)).fim),
      ),
    );
  const mesesComGuiaManual = new Set(manuais.map((d) => d.vencimento.slice(0, 7)));
  const pendentes = competencias.filter((c) => !mesesComGuiaManual.has(somarMeses(c, 1)));
  if (!pendentes.length) return;

  const [tabelas, series] = await Promise.all([
    carregarTabelasFiscais(db, empresa.id),
    carregarSeries(db, empresa.id, somarMeses(pendentes[0], -MESES_DE_HISTORICO), pendentes.at(-1)!),
  ]);
  const fiscal = empresaFiscal(empresa);
  const novas = pendentes.flatMap((c) =>
    obrigacoesDaCompetencia(c, calcularImpostoMes(fiscal, c, series, tabelas)).map((o) => ({
      empresaId: empresa.id,
      data: o.vencimento,
      valorCentavos: o.valor,
      descricao: `${o.descricao} · valor estimado, ajuste quando a guia chegar`,
      categoriaId: categoria.id,
      status: "a_pagar" as const,
      vencimento: o.vencimento,
      origem: "imposto" as const,
      referencia: o.referencia,
    })),
  );
  if (novas.length) await db.insert(despesas).values(novas).onConflictDoNothing({ target: [despesas.empresaId, despesas.referencia] });
}

/**
 * Tudo o que o sistema gera sozinho: folha do mês, despesas recorrentes (até o mês seguinte,
 * para as contas da virada do mês já aparecerem) e guias de impostos dos meses fechados.
 * Idempotente: as telas chamam antes de mostrar os números.
 */
export async function prepararEmpresa(db: BancoDeDados, empresa: Empresa, mesVisto: Mes, mesAtual = mesDeHoje()) {
  await Promise.all([
    sincronizarFolha(db, empresa, mesVisto, mesAtual),
    sincronizarRecorrentes(db, empresa.id, somarMeses(mesAtual, 1)),
  ]);
  // As guias dependem da folha (Fator R), então vêm depois.
  await gerarObrigacoesFiscais(db, empresa, mesAtual);
}
