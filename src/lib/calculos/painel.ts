import { type Centavos, type Pcm, PCM_100, dividirParaCima, razaoPcm } from "@/lib/dinheiro";

export type Comportamento = "fixo" | "variavel";

export interface DespesaAgregada {
  valor: Centavos;
  comportamento: Comportamento;
  /** false para "Impostos sobre vendas": o lucro já desconta o imposto estimado. */
  entraNoLucro: boolean;
}

export interface EntradaResumo {
  /** Vendas com data (competência) no mês. */
  faturamento: Centavos;
  /** Despesas lançadas com data (competência) no mês, agregadas por categoria. */
  despesas: DespesaAgregada[];
  /** Custo real dos funcionários no mês (folha gerada automaticamente). Despesa fixa. */
  folha?: Centavos;
  /** Juros das parcelas de dívidas que vencem no mês. Despesa fixa. A amortização não entra. */
  juros?: Centavos;
  /** Imposto estimado do mês; null quando o cálculo não está disponível (ex.: Lucro Real). */
  impostosEstimados: Centavos | null;
  /** true quando o imposto não depende das vendas (DAS fixo do MEI): conta como custo fixo. */
  impostoFixo?: boolean;
  /** Vendas efetivamente recebidas no mês (pela data de recebimento). */
  entradasCaixa: Centavos;
  /**
   * Tudo o que saiu no mês pela data de pagamento: despesas de qualquer categoria,
   * folha paga (sem provisões) e parcelas de dívidas pagas (juros + amortização).
   */
  saidasCaixa: Centavos;
}

export type PontoEquilibrio =
  | { tipo: "valor"; valor: Centavos; folga: Centavos }
  | { tipo: "sem_faturamento" }
  | { tipo: "margem_negativa" };

export interface ResumoMes {
  faturamento: Centavos;
  /** Total que entra no lucro: lançadas + folha + juros. */
  despesas: Centavos;
  despesasLancadas: Centavos;
  folha: Centavos;
  juros: Centavos;
  despesasFixas: Centavos;
  despesasVariaveis: Centavos;
  impostos: Centavos;
  impostosDisponiveis: boolean;
  lucro: Centavos;
  /** lucro ÷ faturamento; null sem faturamento. */
  margem: Pcm | null;
  caixa: { entradas: Centavos; saidas: Centavos; saldo: Centavos };
  pontoEquilibrio: PontoEquilibrio;
}

export function resumirMes(e: EntradaResumo): ResumoMes {
  const folha = e.folha ?? 0;
  const juros = e.juros ?? 0;
  let fixas = folha + juros;
  let variaveis = 0;
  for (const d of e.despesas) {
    if (!d.entraNoLucro) continue;
    if (d.comportamento === "fixo") fixas += d.valor;
    else variaveis += d.valor;
  }
  const despesas = fixas + variaveis;
  const impostos = e.impostosEstimados ?? 0;
  const lucro = e.faturamento - impostos - despesas;

  return {
    faturamento: e.faturamento,
    despesas,
    despesasLancadas: despesas - folha - juros,
    folha,
    juros,
    despesasFixas: fixas,
    despesasVariaveis: variaveis,
    impostos,
    impostosDisponiveis: e.impostosEstimados !== null,
    lucro,
    margem: razaoPcm(lucro, e.faturamento),
    caixa: {
      entradas: e.entradasCaixa,
      saidas: e.saidasCaixa,
      saldo: e.entradasCaixa - e.saidasCaixa,
    },
    pontoEquilibrio: e.impostoFixo
      ? calcularPontoEquilibrio(e.faturamento, fixas + impostos, variaveis)
      : calcularPontoEquilibrio(e.faturamento, fixas, variaveis + impostos),
  };
}

/**
 * Faturamento necessário para lucro zero, supondo que os custos variáveis
 * (mercadorias, impostos sobre a venda) acompanham o faturamento na mesma
 * proporção do mês e os fixos não mudam:
 *
 *   PE = fixos ÷ (margem de contribuição ÷ faturamento)
 *      = fixos × faturamento ÷ (faturamento − variáveis)
 *
 * Arredonda para cima: é o mínimo que precisa entrar.
 */
export function calcularPontoEquilibrio(
  faturamento: Centavos,
  fixos: Centavos,
  variaveis: Centavos,
): PontoEquilibrio {
  if (faturamento <= 0) return { tipo: "sem_faturamento" };
  const contribuicao = faturamento - variaveis;
  if (contribuicao <= 0) return { tipo: "margem_negativa" };
  const valor = fixos <= 0 ? 0 : dividirParaCima(BigInt(fixos) * BigInt(faturamento), contribuicao);
  return { tipo: "valor", valor, folga: faturamento - valor };
}

export interface FonteValor {
  id: string;
  nome: string;
  valor: Centavos;
}

export interface FonteParticipacao extends FonteValor {
  participacao: Pcm;
}

/**
 * Participação de cada fonte no faturamento, da maior para a menor.
 * Usa o método dos maiores restos para que a soma dê exatamente 100%.
 */
export function participacaoPorFonte(fontes: FonteValor[]): FonteParticipacao[] {
  const total = fontes.reduce((s, f) => s + f.valor, 0);
  const ordenadas = [...fontes].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  if (total <= 0) return ordenadas.map((f) => ({ ...f, participacao: 0 }));

  const t = BigInt(total);
  const base = ordenadas.map((f) => {
    const bruto = BigInt(f.valor) * BigInt(PCM_100);
    return { f, inteiro: Number(bruto / t), resto: bruto % t };
  });
  let sobra = PCM_100 - base.reduce((s, b) => s + b.inteiro, 0);
  const porResto = [...base].sort((a, b) => (b.resto > a.resto ? 1 : b.resto < a.resto ? -1 : 0));
  for (const b of porResto) {
    if (sobra <= 0) break;
    b.inteiro += 1;
    sobra -= 1;
  }
  return base.map((b) => ({ ...b.f, participacao: b.inteiro }));
}
