import "server-only";
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { categoriasDespesa, despesas, fontesReceita, vendas } from "@/db/schema";
import {
  type DespesaAgregada,
  type FonteParticipacao,
  type ResumoMes,
  participacaoPorFonte,
  resumirMes,
} from "@/lib/calculos/painel";
import { type Data, type Mes, intervaloDoMes, somarDias, ultimosMeses } from "@/lib/datas";

const soma = (col: typeof vendas.valorCentavos | typeof despesas.valorCentavos) =>
  sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);
const mesSql = (col: typeof vendas.data | typeof despesas.data) => sql<string>`to_char(${col}, 'YYYY-MM')`;

export interface PontoGrafico {
  mes: Mes;
  faturamento: number;
  despesas: number;
  lucro: number;
}

export interface ItemVencimento {
  tipo: "pagar" | "receber";
  id: string;
  descricao: string;
  data: Data;
  valor: number;
  atrasado: boolean;
}

export interface DadosPainel {
  resumo: ResumoMes;
  fontes: FonteParticipacao[];
  grafico: PontoGrafico[];
  vencimentos: ItemVencimento[];
}

/** Lucro sem impostos enquanto a Fase 3 não chega: o painel avisa o usuário. */
const IMPOSTO_INDISPONIVEL = null;

export async function carregarPainel(
  db: BancoDeDados,
  empresaId: string,
  mes: Mes,
  hojeData: Data,
): Promise<DadosPainel> {
  const meses = ultimosMeses(mes, 12);
  const inicio12 = intervaloDoMes(meses[0]).inicio;
  const { inicio, fim } = intervaloDoMes(mes);

  const vendasVivas = and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm));
  const despesasVivas = and(eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm));

  const [fatPorMes, despPorMes, entradas, saidas, porFonte, aPagar, aReceber] = await Promise.all([
    db
      .select({ mes: mesSql(vendas.data), total: soma(vendas.valorCentavos) })
      .from(vendas)
      .where(and(vendasVivas, gte(vendas.data, inicio12), lt(vendas.data, fim)))
      .groupBy(mesSql(vendas.data)),
    db
      .select({
        mes: mesSql(despesas.data),
        comportamento: categoriasDespesa.comportamento,
        entraNoLucro: categoriasDespesa.entraNoLucro,
        total: soma(despesas.valorCentavos),
      })
      .from(despesas)
      .innerJoin(
        categoriasDespesa,
        and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)),
      )
      .where(and(despesasVivas, gte(despesas.data, inicio12), lt(despesas.data, fim)))
      .groupBy(mesSql(despesas.data), categoriasDespesa.comportamento, categoriasDespesa.entraNoLucro),
    db
      .select({ total: soma(vendas.valorCentavos) })
      .from(vendas)
      .where(
        and(vendasVivas, eq(vendas.status, "recebido"), gte(vendas.dataRecebimento, inicio), lt(vendas.dataRecebimento, fim)),
      ),
    db
      .select({ total: soma(despesas.valorCentavos) })
      .from(despesas)
      .where(and(despesasVivas, eq(despesas.status, "pago"), gte(despesas.pagoEm, inicio), lt(despesas.pagoEm, fim))),
    db
      .select({ id: fontesReceita.id, nome: fontesReceita.nome, valor: soma(vendas.valorCentavos) })
      .from(vendas)
      .innerJoin(
        fontesReceita,
        and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)),
      )
      .where(and(vendasVivas, gte(vendas.data, inicio), lt(vendas.data, fim)))
      .groupBy(fontesReceita.id, fontesReceita.nome),
    db
      .select({ id: despesas.id, descricao: despesas.descricao, categoria: categoriasDespesa.nome, data: despesas.vencimento, valor: despesas.valorCentavos })
      .from(despesas)
      .innerJoin(
        categoriasDespesa,
        and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)),
      )
      .where(and(despesasVivas, eq(despesas.status, "a_pagar"), lte(despesas.vencimento, somarDias(hojeData, 7))))
      .orderBy(asc(despesas.vencimento))
      .limit(30),
    db
      .select({ id: vendas.id, descricao: vendas.descricao, fonte: fontesReceita.nome, data: vendas.dataRecebimento, valor: vendas.valorCentavos })
      .from(vendas)
      .innerJoin(
        fontesReceita,
        and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)),
      )
      .where(and(vendasVivas, eq(vendas.status, "a_receber"), lte(vendas.dataRecebimento, somarDias(hojeData, 7))))
      .orderBy(asc(vendas.dataRecebimento))
      .limit(30),
  ]);

  const fatMap = new Map(fatPorMes.map((l) => [l.mes, l.total]));
  const despMap = new Map<string, DespesaAgregada[]>();
  for (const l of despPorMes) {
    const lista = despMap.get(l.mes) ?? [];
    lista.push({ valor: l.total, comportamento: l.comportamento, entraNoLucro: l.entraNoLucro });
    despMap.set(l.mes, lista);
  }

  const grafico = meses.map((m) => {
    const r = resumirMes({
      faturamento: fatMap.get(m) ?? 0,
      despesas: despMap.get(m) ?? [],
      impostosEstimados: IMPOSTO_INDISPONIVEL,
      entradasCaixa: 0,
      saidasCaixa: 0,
    });
    return { mes: m, faturamento: r.faturamento, despesas: r.despesas + r.impostos, lucro: r.lucro };
  });

  const resumo = resumirMes({
    faturamento: fatMap.get(mes) ?? 0,
    despesas: despMap.get(mes) ?? [],
    impostosEstimados: IMPOSTO_INDISPONIVEL,
    entradasCaixa: entradas[0]?.total ?? 0,
    saidasCaixa: saidas[0]?.total ?? 0,
  });

  const vencimentos: ItemVencimento[] = [
    ...aPagar.map((d) => ({
      tipo: "pagar" as const,
      id: d.id,
      descricao: d.descricao || d.categoria,
      data: d.data,
      valor: d.valor,
      atrasado: d.data < hojeData,
    })),
    ...aReceber.map((v) => ({
      tipo: "receber" as const,
      id: v.id,
      descricao: v.descricao || v.fonte,
      data: v.data,
      valor: v.valor,
      atrasado: v.data < hojeData,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return { resumo, fontes: participacaoPorFonte(porFonte), grafico, vencimentos };
}
