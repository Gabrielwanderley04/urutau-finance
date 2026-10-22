import "server-only";
import { type AnyColumn, and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { categoriasDespesa, despesas, dividas, folhaMensal, fontesReceita, parcelasDivida, vendas } from "@/db/schema";
import {
  type DespesaAgregada,
  type FonteParticipacao,
  type ResumoMes,
  participacaoPorFonte,
  resumirMes,
} from "@/lib/calculos/painel";
import { type Data, type Mes, intervaloDoMes, nomeDoMes, somarDias, ultimosMeses } from "@/lib/datas";

type Coluna = AnyColumn;
const soma = (col: Coluna) => sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);
const mesSql = (col: Coluna) => sql<string>`to_char(${col}, 'YYYY-MM')`;

export interface PontoGrafico {
  mes: Mes;
  faturamento: number;
  despesas: number;
  lucro: number;
}

export interface ItemVencimento {
  tipo: "pagar" | "receber";
  /** Caminho dentro da empresa para abrir o item. */
  link: string;
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
  dividas: { saldo: number; venceNoMes: number; quantidade: number };
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

  const limite7 = somarDias(hojeData, 7);
  const vendasVivas = and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm));
  const parcelasVivas = and(eq(parcelasDivida.empresaId, empresaId), isNull(dividas.excluidoEm));
  const juntarDivida = and(eq(dividas.id, parcelasDivida.dividaId), eq(dividas.empresaId, parcelasDivida.empresaId));
  const despesasVivas = and(eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm));

  const [
    fatPorMes, despPorMes, entradas, saidas, porFonte, aPagar, aReceber,
    folhaPorMes, jurosPorMes, saidaFolha, saidaParcelas, folhaAPagar, parcelasAPagar, resumoDividas,
  ] = await Promise.all([
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
      .where(and(vendasVivas, eq(vendas.status, "a_receber"), lte(vendas.dataRecebimento, limite7)))
      .orderBy(asc(vendas.dataRecebimento))
      .limit(30),
    db
      .select({ mes: folhaMensal.competencia, total: soma(folhaMensal.custoTotal) })
      .from(folhaMensal)
      .where(and(eq(folhaMensal.empresaId, empresaId), gte(folhaMensal.competencia, meses[0]), lte(folhaMensal.competencia, mes)))
      .groupBy(folhaMensal.competencia),
    db
      .select({ mes: mesSql(parcelasDivida.vencimento), total: soma(parcelasDivida.juros) })
      .from(parcelasDivida)
      .innerJoin(dividas, juntarDivida)
      .where(and(parcelasVivas, gte(parcelasDivida.vencimento, inicio12), lt(parcelasDivida.vencimento, fim)))
      .groupBy(mesSql(parcelasDivida.vencimento)),
    db
      .select({ total: soma(folhaMensal.valorCaixa) })
      .from(folhaMensal)
      .where(and(eq(folhaMensal.empresaId, empresaId), eq(folhaMensal.status, "pago"), gte(folhaMensal.pagoEm, inicio), lt(folhaMensal.pagoEm, fim))),
    db
      .select({ total: soma(parcelasDivida.valor) })
      .from(parcelasDivida)
      .innerJoin(dividas, juntarDivida)
      .where(and(parcelasVivas, eq(parcelasDivida.status, "pago"), gte(parcelasDivida.pagoEm, inicio), lt(parcelasDivida.pagoEm, fim))),
    db
      .select({ competencia: folhaMensal.competencia, data: folhaMensal.vencimento, valor: soma(folhaMensal.valorCaixa) })
      .from(folhaMensal)
      .where(and(eq(folhaMensal.empresaId, empresaId), eq(folhaMensal.status, "a_pagar"), lte(folhaMensal.vencimento, limite7)))
      .groupBy(folhaMensal.competencia, folhaMensal.vencimento),
    db
      .select({ id: parcelasDivida.id, dividaId: dividas.id, credor: dividas.credor, numero: parcelasDivida.numero, data: parcelasDivida.vencimento, valor: parcelasDivida.valor })
      .from(parcelasDivida)
      .innerJoin(dividas, juntarDivida)
      .where(and(parcelasVivas, eq(parcelasDivida.status, "a_pagar"), lte(parcelasDivida.vencimento, limite7)))
      .orderBy(asc(parcelasDivida.vencimento))
      .limit(30),
    db
      .select({
        // Saldo no fim do mês: amortização das parcelas não pagas até aquela data.
        saldo: sql<number>`coalesce(sum(${parcelasDivida.amortizacao}) filter (where ${parcelasDivida.status} = 'a_pagar' or ${parcelasDivida.pagoEm} >= ${fim}), 0)::bigint`.mapWith(Number),
        venceNoMes: sql<number>`coalesce(sum(${parcelasDivida.valor}) filter (where ${parcelasDivida.vencimento} >= ${inicio} and ${parcelasDivida.vencimento} < ${fim}), 0)::bigint`.mapWith(Number),
        quantidade: sql<number>`count(distinct ${dividas.id}) filter (where ${parcelasDivida.status} = 'a_pagar' or ${parcelasDivida.pagoEm} >= ${fim})`.mapWith(Number),
      })
      .from(parcelasDivida)
      .innerJoin(dividas, juntarDivida)
      .where(parcelasVivas),
  ]);
  const folhaMap = new Map(folhaPorMes.map((l) => [l.mes, l.total]));
  const jurosMap = new Map(jurosPorMes.map((l) => [l.mes, l.total]));

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
      folha: folhaMap.get(m) ?? 0,
      juros: jurosMap.get(m) ?? 0,
      impostosEstimados: IMPOSTO_INDISPONIVEL,
      entradasCaixa: 0,
      saidasCaixa: 0,
    });
    return { mes: m, faturamento: r.faturamento, despesas: r.despesas + r.impostos, lucro: r.lucro };
  });

  const resumo = resumirMes({
    faturamento: fatMap.get(mes) ?? 0,
    despesas: despMap.get(mes) ?? [],
    folha: folhaMap.get(mes) ?? 0,
    juros: jurosMap.get(mes) ?? 0,
    impostosEstimados: IMPOSTO_INDISPONIVEL,
    entradasCaixa: entradas[0]?.total ?? 0,
    saidasCaixa: (saidas[0]?.total ?? 0) + (saidaFolha[0]?.total ?? 0) + (saidaParcelas[0]?.total ?? 0),
  });

  const vencimentos: ItemVencimento[] = [
    ...aPagar.map((d) => ({
      tipo: "pagar" as const,
      link: `despesas/${d.id}`,
      id: d.id,
      descricao: d.descricao || d.categoria,
      data: d.data,
      valor: d.valor,
      atrasado: d.data < hojeData,
    })),
    ...aReceber.map((v) => ({
      tipo: "receber" as const,
      link: `vendas/${v.id}`,
      id: v.id,
      descricao: v.descricao || v.fonte,
      data: v.data,
      valor: v.valor,
      atrasado: v.data < hojeData,
    })),
    ...folhaAPagar.map((f) => ({
      tipo: "pagar" as const,
      link: `funcionarios?mes=${f.competencia}`,
      id: `folha-${f.competencia}`,
      descricao: `Folha de pagamento de ${nomeDoMes(f.competencia)}`,
      data: f.data,
      valor: f.valor,
      atrasado: f.data < hojeData,
    })),
    ...parcelasAPagar.map((p) => ({
      tipo: "pagar" as const,
      link: `dividas/${p.dividaId}`,
      id: p.id,
      descricao: `${p.credor} · parcela ${p.numero}`,
      data: p.data,
      valor: p.valor,
      atrasado: p.data < hojeData,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return {
    resumo,
    fontes: participacaoPorFonte(porFonte),
    grafico,
    vencimentos,
    dividas: resumoDividas[0] ?? { saldo: 0, venceNoMes: 0, quantidade: 0 },
  };
}
