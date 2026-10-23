import "server-only";
import { type AnyColumn, and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { categoriasDespesa, despesas, dividas, folhaMensal, fontesReceita, parcelasDivida, vendas } from "@/db/schema";
import { type Data, nomeDoMes, somarDias } from "@/lib/datas";

export type TipoConta = "despesa" | "folha" | "parcela" | "venda";

export interface Conta {
  tipo: TipoConta;
  sentido: "pagar" | "receber";
  /** id do registro (ou competência, no caso da folha). */
  id: string;
  link: string;
  descricao: string;
  detalhe: string;
  data: Data;
  valor: number;
}

export type Grupo = "atrasadas" | "hoje" | "semana" | "mes";

export function grupoDe(data: Data, hoje: Data): Grupo {
  if (data < hoje) return "atrasadas";
  if (data === hoje) return "hoje";
  if (data <= somarDias(hoje, 7)) return "semana";
  return "mes";
}

const soma = (col: AnyColumn) => sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);

/** Tudo o que está em aberto até `dias` dias à frente, inclusive o que já venceu. */
export async function listarContas(db: BancoDeDados, empresaId: string, hoje: Data, dias = 30): Promise<Conta[]> {
  const ate = somarDias(hoje, dias);
  const [ds, folha, parcelas, receber] = await Promise.all([
    db
      .select({ id: despesas.id, descricao: despesas.descricao, categoria: categoriasDespesa.nome, origem: despesas.origem, data: despesas.vencimento, valor: despesas.valorCentavos })
      .from(despesas)
      .innerJoin(categoriasDespesa, and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)))
      .where(and(eq(despesas.empresaId, empresaId), isNull(despesas.excluidoEm), eq(despesas.status, "a_pagar"), lte(despesas.vencimento, ate)))
      .orderBy(asc(despesas.vencimento)),
    db
      .select({ competencia: folhaMensal.competencia, data: folhaMensal.vencimento, valor: soma(folhaMensal.valorCaixa), pessoas: sql<number>`count(*)::int` })
      .from(folhaMensal)
      .where(and(eq(folhaMensal.empresaId, empresaId), eq(folhaMensal.status, "a_pagar"), lte(folhaMensal.vencimento, ate)))
      .groupBy(folhaMensal.competencia, folhaMensal.vencimento),
    db
      .select({ id: parcelasDivida.id, dividaId: dividas.id, credor: dividas.credor, numero: parcelasDivida.numero, juros: parcelasDivida.juros, data: parcelasDivida.vencimento, valor: parcelasDivida.valor })
      .from(parcelasDivida)
      .innerJoin(dividas, and(eq(dividas.id, parcelasDivida.dividaId), eq(dividas.empresaId, parcelasDivida.empresaId)))
      .where(and(eq(parcelasDivida.empresaId, empresaId), isNull(dividas.excluidoEm), eq(parcelasDivida.status, "a_pagar"), lte(parcelasDivida.vencimento, ate))),
    db
      .select({ id: vendas.id, descricao: vendas.descricao, fonte: fontesReceita.nome, data: vendas.dataRecebimento, valor: vendas.valorCentavos })
      .from(vendas)
      .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
      .where(and(eq(vendas.empresaId, empresaId), isNull(vendas.excluidoEm), eq(vendas.status, "a_receber"), lte(vendas.dataRecebimento, ate))),
  ]);

  const origem = { manual: "", recorrente: " · todo mês", imposto: " · guia de imposto" } as const;
  return [
    ...ds.map((d): Conta => ({ tipo: "despesa", sentido: "pagar", id: d.id, link: `despesas/${d.id}`, descricao: d.descricao || d.categoria, detalhe: `${d.categoria}${origem[d.origem]}`, data: d.data, valor: d.valor })),
    ...folha.map((f): Conta => ({ tipo: "folha", sentido: "pagar", id: f.competencia, link: `funcionarios?mes=${f.competencia}`, descricao: `Folha de pagamento de ${nomeDoMes(f.competencia)}`, detalhe: `${f.pessoas} ${f.pessoas === 1 ? "pessoa" : "pessoas"} · salários, FGTS e benefícios`, data: f.data, valor: f.valor })),
    ...parcelas.map((p): Conta => ({ tipo: "parcela", sentido: "pagar", id: p.id, link: `dividas/${p.dividaId}`, descricao: `${p.credor} · parcela ${p.numero}`, detalhe: "Dívida", data: p.data, valor: p.valor })),
    ...receber.map((v): Conta => ({ tipo: "venda", sentido: "receber", id: v.id, link: `vendas/${v.id}`, descricao: v.descricao || v.fonte, detalhe: v.fonte, data: v.data, valor: v.valor })),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.sentido.localeCompare(b.sentido));
}
