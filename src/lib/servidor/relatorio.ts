import "server-only";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { type Empresa, categoriasDespesa, despesas, fontesReceita, funcionarios, pagamentosProvisao, vendas } from "@/db/schema";
import type { ImpostoMes } from "@/lib/calculos/impostos";
import { type Data, type Mes, intervaloDoMes } from "@/lib/datas";
import { type ResumoDivida, listarDividas, parcelasDoMes } from "./dividas";
import { folhaDoMes } from "./folha";
import { type DadosPainel, carregarPainel } from "./painel";

export interface LinhaImpostoRelatorio {
  descricao: string;
  base: number | null;
  aliquota: number | null;
  valor: number;
}

export interface Relatorio {
  empresa: Empresa;
  mes: Mes;
  geradoEm: Data;
  painel: DadosPainel;
  vendas: { data: Data; descricao: string; fonte: string; natureza: string; forma: string; status: string; recebimento: Data; valor: number }[];
  despesas: { data: Data; descricao: string; categoria: string; entraNoLucro: boolean; status: string; vencimento: Data; pagoEm: Data | null; valor: number; origem: string }[];
  folha: Awaited<ReturnType<typeof folhaDoMes>>;
  provisoesPagas: { nome: string; tipo: string; pagoEm: Data; valor: number }[];
  parcelas: Awaited<ReturnType<typeof parcelasDoMes>>;
  dividas: ResumoDivida[];
  impostos: LinhaImpostoRelatorio[];
}

/** Linhas de imposto num formato único para CSV e PDF, qualquer que seja o regime. */
export function linhasDeImposto(i: ImpostoMes): LinhaImpostoRelatorio[] {
  if (i.regime === "mei") return [{ descricao: "DAS do MEI (valor fixo)", base: null, aliquota: null, valor: i.total }];
  if (i.regime === "simples")
    return i.simples.parcelas.map((p) => ({
      descricao: `Simples Nacional · ${p.natureza === "comercio" ? "comércio" : "serviços"} · Anexo ${p.anexo}, ${p.faixa.faixa}ª faixa`,
      base: p.receita,
      aliquota: p.aliquotaEfetiva,
      valor: p.imposto,
    }));
  if (i.regime === "presumido") return i.presumido.linhas.map((l) => ({ descricao: l.nome, base: l.base, aliquota: l.aliquota, valor: l.valor }));
  return [];
}

export async function montarRelatorio(db: BancoDeDados, empresa: Empresa, mes: Mes, hoje: Data): Promise<Relatorio> {
  const { inicio, fim } = intervaloDoMes(mes);
  const [painel, listaVendas, listaDespesas, folha, provisoes, parcelas, dividas] = await Promise.all([
    carregarPainel(db, empresa, mes, hoje),
    db
      .select({ data: vendas.data, descricao: vendas.descricao, fonte: fontesReceita.nome, natureza: fontesReceita.natureza, forma: vendas.formaPagamento, status: vendas.status, recebimento: vendas.dataRecebimento, valor: vendas.valorCentavos })
      .from(vendas)
      .innerJoin(fontesReceita, and(eq(fontesReceita.id, vendas.fonteReceitaId), eq(fontesReceita.empresaId, vendas.empresaId)))
      .where(and(eq(vendas.empresaId, empresa.id), isNull(vendas.excluidoEm), gte(vendas.data, inicio), lt(vendas.data, fim)))
      .orderBy(asc(vendas.data)),
    db
      .select({ data: despesas.data, descricao: despesas.descricao, categoria: categoriasDespesa.nome, entraNoLucro: categoriasDespesa.entraNoLucro, status: despesas.status, vencimento: despesas.vencimento, pagoEm: despesas.pagoEm, valor: despesas.valorCentavos, origem: despesas.origem })
      .from(despesas)
      .innerJoin(categoriasDespesa, and(eq(categoriasDespesa.id, despesas.categoriaId), eq(categoriasDespesa.empresaId, despesas.empresaId)))
      .where(and(eq(despesas.empresaId, empresa.id), isNull(despesas.excluidoEm), gte(despesas.data, inicio), lt(despesas.data, fim)))
      .orderBy(asc(categoriasDespesa.ordem), asc(despesas.data)),
    folhaDoMes(db, empresa.id, mes),
    db
      .select({ nome: funcionarios.nome, tipo: pagamentosProvisao.tipo, pagoEm: pagamentosProvisao.pagoEm, valor: pagamentosProvisao.valorCentavos })
      .from(pagamentosProvisao)
      .innerJoin(funcionarios, and(eq(funcionarios.id, pagamentosProvisao.funcionarioId), eq(funcionarios.empresaId, pagamentosProvisao.empresaId)))
      .where(and(eq(pagamentosProvisao.empresaId, empresa.id), gte(pagamentosProvisao.pagoEm, inicio), lt(pagamentosProvisao.pagoEm, fim))),
    parcelasDoMes(db, empresa.id, mes),
    listarDividas(db, empresa.id, mes, hoje),
  ]);
  return {
    empresa,
    mes,
    geradoEm: hoje,
    painel,
    vendas: listaVendas,
    despesas: listaDespesas,
    folha,
    provisoesPagas: provisoes,
    parcelas,
    dividas: dividas.filter((d) => d.saldoDevedor > 0 || d.venceNoMes > 0),
    impostos: linhasDeImposto(painel.imposto),
  };
}
