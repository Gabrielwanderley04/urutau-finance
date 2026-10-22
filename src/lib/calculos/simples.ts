import { type Centavos, type Pcm, PCM_100, dividirArredondado } from "@/lib/dinheiro";
import { type Mes, somarMeses } from "@/lib/datas";

export type Anexo = "I" | "II" | "III" | "IV" | "V";

export interface FaixaSimples {
  anexo: Anexo;
  faixa: number;
  receitaAte: Centavos;
  aliquotaNominal: Pcm;
  parcelaDeduzir: Centavos;
}

/** Quantos meses inteiros existem entre `de` e `ate` (ate − de). */
export function mesesEntre(de: Mes, ate: Mes): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export interface Acumulado12 {
  valor: Centavos;
  /** Como foi calculado, para explicar na tela. */
  metodo: "soma_12" | "primeiro_mes" | "media_proporcional";
  mesesConsiderados: number;
}

/**
 * Soma dos 12 meses anteriores ao mês de apuração (RBT12 ou folha FS12).
 * Empresa com menos de 12 meses de atividade (Resolução CGSN 140/2018, arts. 22 e 26):
 * - no 1º mês: o valor do próprio mês × 12;
 * - do 2º ao 12º: média dos meses anteriores × 12.
 */
export function acumulado12(mes: Mes, valorDe: (m: Mes) => Centavos, inicioAtividade: Mes | null): Acumulado12 {
  const mesesAtividade = inicioAtividade ? mesesEntre(inicioAtividade, mes) : Infinity;
  if (mesesAtividade <= 0) return { valor: valorDe(mes) * 12, metodo: "primeiro_mes", mesesConsiderados: 1 };
  if (mesesAtividade < 12) {
    let soma = 0;
    for (let i = 1; i <= mesesAtividade; i++) soma += valorDe(somarMeses(mes, -i));
    return { valor: dividirArredondado(BigInt(soma) * 12n, mesesAtividade), metodo: "media_proporcional", mesesConsiderados: mesesAtividade };
  }
  let soma = 0;
  for (let i = 1; i <= 12; i++) soma += valorDe(somarMeses(mes, -i));
  return { valor: soma, metodo: "soma_12", mesesConsiderados: 12 };
}

export function encontrarFaixa(rbt12: Centavos, faixas: FaixaSimples[]): { faixa: FaixaSimples; acimaDoLimite: boolean } {
  const ordenadas = [...faixas].sort((a, b) => a.faixa - b.faixa);
  if (ordenadas.length === 0) throw new Error("Tabela do Simples sem faixas cadastradas");
  const f = ordenadas.find((x) => rbt12 <= x.receitaAte);
  return f ? { faixa: f, acimaDoLimite: false } : { faixa: ordenadas.at(-1)!, acimaDoLimite: true };
}

/** Alíquota efetiva = (RBT12 × nominal − parcela a deduzir) ÷ RBT12, em pcm (só para exibir). */
export function aliquotaEfetiva(rbt12: Centavos, f: FaixaSimples): Pcm {
  if (rbt12 <= 0) return f.aliquotaNominal;
  const num = BigInt(rbt12) * BigInt(f.aliquotaNominal) - BigInt(f.parcelaDeduzir) * BigInt(PCM_100);
  return dividirArredondado(num, rbt12);
}

/**
 * Imposto do mês = receita × alíquota efetiva, com a alíquota em fração exata
 * (sem arredondar a alíquota antes): receita × (RBT12 × nominal − PD) ÷ RBT12.
 */
export function impostoSimples(receita: Centavos, rbt12: Centavos, f: FaixaSimples): Centavos {
  if (receita <= 0) return 0;
  if (rbt12 <= 0) return dividirArredondado(BigInt(receita) * BigInt(f.aliquotaNominal), PCM_100);
  const num = BigInt(receita) * (BigInt(rbt12) * BigInt(f.aliquotaNominal) - BigInt(f.parcelaDeduzir) * BigInt(PCM_100));
  return dividirArredondado(num, BigInt(rbt12) * BigInt(PCM_100));
}

export interface FatorR {
  folha12: Centavos;
  rbt12: Centavos;
  /** folha ÷ receita, em pcm; null sem receita. */
  fator: Pcm | null;
  anexo: "III" | "V";
}

/** Fator R = folha dos últimos 12 meses ÷ RBT12. ≥ 28% → Anexo III; senão, Anexo V. */
export function calcularFatorR(folha12: Centavos, rbt12: Centavos, minimo: Pcm): FatorR {
  if (rbt12 <= 0) return { folha12, rbt12, fator: null, anexo: folha12 > 0 ? "III" : "V" };
  const fator = Number((BigInt(folha12) * BigInt(PCM_100)) / BigInt(rbt12)); // trunca: 27,999% não vira 28%
  return { folha12, rbt12, fator, anexo: fator >= minimo ? "III" : "V" };
}

export interface ParcelaSimples {
  natureza: "comercio" | "servico";
  anexo: Anexo;
  receita: Centavos;
  faixa: FaixaSimples;
  aliquotaEfetiva: Pcm;
  imposto: Centavos;
}

export interface ResultadoSimples {
  rbt12: Acumulado12;
  fatorR: FatorR | null;
  parcelas: ParcelaSimples[];
  total: Centavos;
  acimaDoLimite: boolean;
  acimaDoSublimite: boolean;
}

export interface EntradaSimples {
  mes: Mes;
  receitaComercio: Centavos;
  receitaServico: Centavos;
  receitaTotalDe: (m: Mes) => Centavos;
  folhaDe: (m: Mes) => Centavos;
  inicioAtividade: Mes | null;
  anexoComercio: Anexo | null;
  anexoServicos: Anexo | null;
  sujeitoFatorR: boolean;
  tabelas: Record<Anexo, FaixaSimples[]>;
  fatorRMinimo: Pcm;
  limiteAnual: Centavos;
  sublimite: Centavos;
}

export function calcularSimples(e: EntradaSimples): ResultadoSimples {
  const rbt12 = acumulado12(e.mes, e.receitaTotalDe, e.inicioAtividade);
  let fatorR: FatorR | null = null;
  const parcelas: ParcelaSimples[] = [];

  const calcular = (natureza: "comercio" | "servico", anexo: Anexo, receita: Centavos) => {
    const { faixa } = encontrarFaixa(rbt12.valor, e.tabelas[anexo]);
    parcelas.push({ natureza, anexo, receita, faixa, aliquotaEfetiva: aliquotaEfetiva(rbt12.valor, faixa), imposto: impostoSimples(receita, rbt12.valor, faixa) });
  };

  // Receita de comércio sem anexo definido (cadastro incompleto): usa o Anexo I.
  if (e.anexoComercio || e.receitaComercio > 0) calcular("comercio", e.anexoComercio ?? "I", e.receitaComercio);
  if (e.anexoServicos || e.receitaServico > 0) {
    let anexo: Anexo = e.anexoServicos ?? "III";
    if (e.sujeitoFatorR) {
      // A folha também é proporcionalizada no início de atividade (CGSN 140, art. 26).
      const folha12 = acumulado12(e.mes, e.folhaDe, e.inicioAtividade);
      fatorR = calcularFatorR(folha12.valor, rbt12.valor, e.fatorRMinimo);
      anexo = fatorR.anexo;
    }
    calcular("servico", anexo, e.receitaServico);
  }

  return {
    rbt12,
    fatorR,
    parcelas,
    total: parcelas.reduce((s, p) => s + p.imposto, 0),
    acimaDoLimite: rbt12.valor > e.limiteAnual,
    acimaDoSublimite: rbt12.valor > e.sublimite,
  };
}
