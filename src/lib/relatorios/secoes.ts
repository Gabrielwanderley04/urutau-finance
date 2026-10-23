import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";
import { NOME_FORMA } from "@/lib/rotulos";
import { formatarData } from "@/lib/datas";
import { formatarPcm } from "@/lib/dinheiro";
import type { Relatorio } from "@/lib/servidor/relatorio";
import { type Celula, data, gerarCsv, reais } from "./csv";

const pct = (p: number | null): Celula => (p === null ? "" : formatarPcm(p, 3));
const STATUS: Record<string, string> = { recebido: "Recebido", a_receber: "A receber", pago: "Pago", a_pagar: "A pagar" };

export const SECOES = ["resumo", "vendas", "despesas", "folha", "dividas", "impostos"] as const;
export type Secao = (typeof SECOES)[number];

export const NOME_SECAO: Record<Secao, string> = {
  resumo: "Resumo do mês",
  vendas: "Vendas",
  despesas: "Despesas",
  folha: "Funcionários",
  dividas: "Dívidas",
  impostos: "Impostos",
};

/** Um CSV por seção, com o mesmo conteúdo do PDF. */
export function csvDaSecao(r: Relatorio, secao: Secao): string {
  const p = r.painel.resumo;
  switch (secao) {
    case "resumo":
      return gerarCsv(["Item", "Valor (R$)", "Explicação"], [
        ["Faturamento", reais(p.faturamento), "Vendas do mês, recebidas ou não"],
        ["Impostos estimados", p.impostosDisponiveis ? reais(p.impostos) : "", "Valor estimado. Confirme com o seu contador."],
        ["Despesas lançadas", reais(p.despesasLancadas), "Exclui guias de impostos pagas (contam só no caixa)"],
        ["Custo dos funcionários", reais(p.folha), "Salários, FGTS, reservas de 13º e férias, encargos e benefícios"],
        ["Juros de dívidas", reais(p.juros), "Só os juros; a amortização não é despesa"],
        ["Lucro líquido", reais(p.lucro), "Faturamento − impostos − despesas"],
        ["Margem (%)", pct(p.margem), "Lucro ÷ faturamento"],
        ["Entradas de caixa", reais(p.caixa.entradas), "Recebido no mês"],
        ["Saídas de caixa", reais(p.caixa.saidas), "Pago no mês, inclusive parcelas inteiras de dívidas"],
        ["Saldo de caixa", reais(p.caixa.saldo), ""],
        ["Ponto de equilíbrio", p.pontoEquilibrio.tipo === "valor" ? reais(p.pontoEquilibrio.valor) : "", "Faturamento mínimo para não ter prejuízo"],
        ["Total em dívidas (fim do mês)", reais(r.painel.dividas.saldo), "Saldo devedor sem juros futuros"],
      ]);
    case "vendas":
      return gerarCsv(
        ["Data", "Descrição", "Fonte", "Natureza", "Forma de pagamento", "Situação", "Recebimento", "Valor (R$)"],
        r.vendas.map((v) => [data(v.data), v.descricao, v.fonte, v.natureza === "comercio" ? "Comércio" : "Serviço", NOME_FORMA[v.forma as keyof typeof NOME_FORMA], STATUS[v.status], data(v.recebimento), reais(v.valor)]),
      );
    case "despesas":
      return gerarCsv(
        ["Data", "Descrição", "Categoria", "Entra no lucro", "Situação", "Vencimento", "Pago em", "Origem", "Valor (R$)"],
        r.despesas.map((d) => [data(d.data), d.descricao, d.categoria, d.entraNoLucro ? "Sim" : "Não (só caixa)", STATUS[d.status], data(d.vencimento), data(d.pagoEm), d.origem === "manual" ? "Lançada" : d.origem === "recorrente" ? "Recorrente" : "Guia de imposto", reais(d.valor)]),
      );
    case "folha":
      return gerarCsv(
        ["Funcionário", "Cargo", "Dias", "Salário", "FGTS", "Reserva 13º", "Reserva férias + 1/3", "FGTS reservas", "INSS patronal", "RAT", "Terceiros", "Benefícios", "Custo total", "Pago no mês (caixa)", "Situação"],
        [
          ...r.folha.map(({ linha: l, nome, cargo }) => [nome, cargo, l.diasTrabalhados, reais(l.salario), reais(l.fgts), reais(l.provisao13), reais(l.provisaoFerias), reais(l.fgtsProvisoes), reais(l.inssPatronal), reais(l.rat), reais(l.terceiros), reais(l.beneficios), reais(l.custoTotal), reais(l.valorCaixa), STATUS[l.status]]),
          ...r.provisoesPagas.map((pg) => [pg.nome, pg.tipo === "ferias" ? "Pagamento de férias" : "Pagamento de 13º", "", "", "", "", "", "", "", "", "", "", "", reais(pg.valor), `Pago em ${formatarData(pg.pagoEm)}`]),
        ],
      );
    case "dividas":
      return gerarCsv(
        ["Credor", "Tipo", "Juros ao mês", "Parcela do mês", "Vencimento", "Valor da parcela", "Juros (despesa)", "Amortização", "Situação", "Saldo devedor no fim do mês", "Termina em"],
        r.dividas.map((d) => {
          const parcela = r.parcelas.find((p) => p.parcela.dividaId === d.id)?.parcela;
          return [d.credor, NOME_TIPO_DIVIDA[d.tipo], pct(d.jurosMensaisPcm), parcela ? `${parcela.numero}/${d.parcelasTotal}` : "", data(parcela?.vencimento ?? null), parcela ? reais(parcela.valor) : "", parcela ? reais(parcela.juros) : "", parcela ? reais(parcela.amortizacao) : "", parcela ? STATUS[parcela.status] : "", reais(d.saldoDevedor), data(d.terminaEm)];
        }),
      );
    case "impostos":
      return gerarCsv(
        ["Imposto", "Base (R$)", "Alíquota", "Valor estimado (R$)"],
        [...r.impostos.map((i) => [i.descricao, i.base === null ? "" : reais(i.base), pct(i.aliquota), reais(i.valor)]), ["Valor estimado. Confirme com o seu contador.", "", "", ""]],
      );
  }
}

export function nomeArquivo(r: Pick<Relatorio, "empresa" | "mes">, extensao: string, secao?: Secao) {
  const empresa = r.empresa.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${empresa}-${r.mes}${secao ? `-${secao}` : ""}.${extensao}`;
}
