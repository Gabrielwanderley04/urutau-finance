import "server-only";
import { type AnyColumn, and, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { type Empresa, categoriasDespesa, despesas, folhaMensal, fontesReceita, receitasHistoricas, simplesFaixas, vendas } from "@/db/schema";
import { type EmpresaFiscal, type ImpostoMes, type Series, type TabelasFiscais, type ValoresMes, calcularImpostoMes } from "@/lib/calculos/impostos";
import { type Mes, intervaloDoMes, mesDe, somarMeses } from "@/lib/datas";
import { carregarParametros } from "./parametros";

export function empresaFiscal(e: Empresa): EmpresaFiscal {
  return {
    regime: e.regime,
    atividade: e.atividade,
    anexoComercio: e.anexoComercio,
    anexoServicos: e.anexoServicos,
    sujeitoFatorR: e.sujeitoFatorR,
    aliquotaIssPcm: e.aliquotaIssPcm,
    aliquotaIcmsPcm: e.aliquotaIcmsPcm,
    inicioAtividade: e.inicioAtividade ? mesDe(e.inicioAtividade) : null,
  };
}

export async function carregarTabelasFiscais(db: BancoDeDados, empresaId: string): Promise<TabelasFiscais> {
  const [params, faixas] = await Promise.all([
    carregarParametros(db, empresaId),
    db
      .select({
        anexo: simplesFaixas.anexo,
        faixa: simplesFaixas.faixa,
        receitaAte: simplesFaixas.receitaAteCentavos,
        aliquotaNominal: simplesFaixas.aliquotaNominalPcm,
        parcelaDeduzir: simplesFaixas.parcelaDeduzirCentavos,
        vigenciaInicio: simplesFaixas.vigenciaInicio,
        vigenciaFim: simplesFaixas.vigenciaFim,
      })
      .from(simplesFaixas),
  ]);
  return { ...params, faixas };
}

const soma = (col: AnyColumn) => sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);

/**
 * Receita (por natureza) e folha de cada mês de [de, ate].
 * Folha para o Fator R = salários + FGTS + INSS patronal + 13º (pela reserva mensal)
 * + despesas de categorias marcadas como folha (pró-labore, extras de pessoal).
 */
export async function carregarSeries(db: BancoDeDados, empresaId: string, de: Mes, ate: Mes): Promise<Series> {
  const inicio = intervaloDoMes(de).inicio;
  const fim = intervaloDoMes(ate).fim;
  const mesVenda = sql<string>`to_char(${vendas.data}, 'YYYY-MM')`;
  const mesDespesa = sql<string>`to_char(${despesas.data}, 'YYYY-MM')`;

  const [receitas, folha, outrasFolha, historico] = await Promise.all([
    db
      .select({ mes: mesVenda, natureza: fontesReceita.natureza, total: soma(vendas.valorCentavos) })
      .from(vendas)
      .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
      .where(and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm), gte(vendas.data, inicio), lt(vendas.data, fim)))
      .groupBy(mesVenda, fontesReceita.natureza),
    db
      .select({
        mes: folhaMensal.competencia,
        total: sql<number>`coalesce(sum(${folhaMensal.salario} + ${folhaMensal.fgts} + ${folhaMensal.inssPatronal} + ${folhaMensal.provisao13}), 0)::bigint`.mapWith(Number),
      })
      .from(folhaMensal)
      .where(and(eq(folhaMensal.empresaId, empresaId), gte(folhaMensal.competencia, de), lte(folhaMensal.competencia, ate)))
      .groupBy(folhaMensal.competencia),
    db
      .select({ mes: mesDespesa, total: soma(despesas.valorCentavos) })
      .from(despesas)
      .innerJoin(categoriasDespesa, and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)))
      .where(
        and(
          eq(despesas.empresaId, empresaId),
          isNull(despesas.excluidoEm),
          eq(categoriasDespesa.entraNaFolhaFatorR, true),
          gte(despesas.data, inicio),
          lt(despesas.data, fim),
        ),
      )
      .groupBy(mesDespesa),
    db
      .select()
      .from(receitasHistoricas)
      .where(and(eq(receitasHistoricas.empresaId, empresaId), gte(receitasHistoricas.competencia, de), lte(receitasHistoricas.competencia, ate))),
  ]);

  const series: Series = new Map();
  const pegar = (m: Mes): ValoresMes => {
    let v = series.get(m);
    if (!v) {
      v = { comercio: 0, servico: 0, folha: 0 };
      series.set(m, v);
    }
    return v;
  };
  for (const r of receitas) pegar(r.mes)[r.natureza] += r.total;
  for (const f of folha) pegar(f.mes).folha += f.total;
  for (const f of outrasFolha) pegar(f.mes).folha += f.total;
  for (const h of historico) {
    const v = pegar(h.competencia);
    v.receitaHistorica = h.receitaCentavos;
    v.folhaHistorica = h.folhaCentavos;
  }
  return series;
}

/** Quantos meses antes do mês pedido são necessários para calcular o imposto dele. */
export const MESES_DE_HISTORICO = 12;

export async function impostoDoMes(db: BancoDeDados, empresa: Empresa, mes: Mes): Promise<{ imposto: ImpostoMes; series: Series }> {
  const [tabelas, series] = await Promise.all([
    carregarTabelasFiscais(db, empresa.id),
    carregarSeries(db, empresa.id, somarMeses(mes, -MESES_DE_HISTORICO), mes),
  ]);
  return { imposto: calcularImpostoMes(empresaFiscal(empresa), mes, series, tabelas), series };
}
