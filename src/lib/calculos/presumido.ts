import { type Centavos, type Pcm, PCM_100, aplicarPcm, dividirArredondado } from "@/lib/dinheiro";

export interface ParametrosPresumido {
  presuncaoIrpjComercio: Pcm;
  presuncaoIrpjServico: Pcm;
  presuncaoCsllComercio: Pcm;
  presuncaoCsllServico: Pcm;
  irpj: Pcm;
  irpjAdicional: Pcm;
  /** Base mensal livre do adicional (R$ 20 mil = R$ 60 mil por trimestre). */
  irpjAdicionalLimiteMensal: Centavos;
  csll: Pcm;
  pis: Pcm;
  cofins: Pcm;
  /** LC 224/2025: receita anual acima deste valor tem presunção acrescida. */
  lc224LimiteAnual: Centavos;
  /** Acréscimo sobre o percentual de presunção (10% → 8% vira 8,8%). */
  lc224AcrescimoIrpj: Pcm;
  lc224AcrescimoCsll: Pcm;
}

export interface EntradaPresumido {
  receitaComercio: Centavos;
  receitaServico: Centavos;
  /** Receita do ano-calendário antes deste mês (para a LC 224). */
  receitaAnoAntes: Centavos;
  issPcm: Pcm | null;
  icmsPcm: Pcm | null;
  p: ParametrosPresumido;
}

export type ChaveImposto = "irpj" | "irpj_adicional" | "csll" | "pis" | "cofins" | "iss" | "icms";

export interface LinhaImposto {
  chave: ChaveImposto;
  nome: string;
  base: Centavos;
  aliquota: Pcm;
  valor: Centavos;
}

export interface ResultadoPresumido {
  receita: Centavos;
  /** Parte da receita do mês acima do limite anual da LC 224. */
  receitaAcimaLc224: Centavos;
  baseIrpj: Centavos;
  baseCsll: Centavos;
  linhas: LinhaImposto[];
  total: Centavos;
  faltaAliquota: ("iss" | "icms")[];
}

/** Quanto da receita do mês ultrapassa o limite anual, dado o acumulado antes dele. */
export function excedenteNoMes(receitaAnoAntes: Centavos, receitaMes: Centavos, limite: Centavos): Centavos {
  return Math.max(0, receitaAnoAntes + receitaMes - limite) - Math.max(0, receitaAnoAntes - limite);
}

/**
 * Base presumida = receita × percentual de presunção, com o acréscimo da LC 224
 * aplicado só sobre a parte excedente. Uma única divisão no fim.
 */
export function basePresumida(
  comercio: Centavos,
  servico: Centavos,
  excedente: Centavos,
  pComercio: Pcm,
  pServico: Pcm,
  acrescimo: Pcm,
): Centavos {
  const receita = comercio + servico;
  const P = BigInt(PCM_100);
  // O excedente é dividido entre comércio e serviço na proporção da receita do mês.
  const excCom = receita > 0 ? dividirArredondado(BigInt(excedente) * BigInt(comercio), receita) : 0;
  const excServ = excedente - excCom;
  const normal = (BigInt(comercio) * BigInt(pComercio) + BigInt(servico) * BigInt(pServico)) * P;
  const extra = (BigInt(excCom) * BigInt(pComercio) + BigInt(excServ) * BigInt(pServico)) * BigInt(acrescimo);
  return dividirArredondado(normal + extra, P * P);
}

/**
 * Estimativa mensal do Lucro Presumido.
 * IRPJ e CSLL são apurados por trimestre; aqui mostramos a parte do mês. O adicional de 10%
 * usa o limite mensal (R$ 20 mil), que é a fração de um mês dos R$ 60 mil do trimestre.
 */
export function calcularPresumido(e: EntradaPresumido): ResultadoPresumido {
  const { p } = e;
  const receita = e.receitaComercio + e.receitaServico;
  const excedente = excedenteNoMes(e.receitaAnoAntes, receita, p.lc224LimiteAnual);
  const baseIrpj = basePresumida(e.receitaComercio, e.receitaServico, excedente, p.presuncaoIrpjComercio, p.presuncaoIrpjServico, p.lc224AcrescimoIrpj);
  const baseCsll = basePresumida(e.receitaComercio, e.receitaServico, excedente, p.presuncaoCsllComercio, p.presuncaoCsllServico, p.lc224AcrescimoCsll);
  const baseAdicional = Math.max(0, baseIrpj - p.irpjAdicionalLimiteMensal);

  const linhas: LinhaImposto[] = [
    { chave: "irpj", nome: "IRPJ", base: baseIrpj, aliquota: p.irpj, valor: aplicarPcm(baseIrpj, p.irpj) },
    { chave: "irpj_adicional", nome: "Adicional do IRPJ", base: baseAdicional, aliquota: p.irpjAdicional, valor: aplicarPcm(baseAdicional, p.irpjAdicional) },
    { chave: "csll", nome: "CSLL", base: baseCsll, aliquota: p.csll, valor: aplicarPcm(baseCsll, p.csll) },
    { chave: "pis", nome: "PIS", base: receita, aliquota: p.pis, valor: aplicarPcm(receita, p.pis) },
    { chave: "cofins", nome: "Cofins", base: receita, aliquota: p.cofins, valor: aplicarPcm(receita, p.cofins) },
  ];
  const faltaAliquota: ("iss" | "icms")[] = [];
  if (e.receitaServico > 0) {
    if (e.issPcm === null) faltaAliquota.push("iss");
    linhas.push({ chave: "iss", nome: "ISS", base: e.receitaServico, aliquota: e.issPcm ?? 0, valor: aplicarPcm(e.receitaServico, e.issPcm ?? 0) });
  }
  if (e.receitaComercio > 0) {
    if (e.icmsPcm === null) faltaAliquota.push("icms");
    linhas.push({ chave: "icms", nome: "ICMS", base: e.receitaComercio, aliquota: e.icmsPcm ?? 0, valor: aplicarPcm(e.receitaComercio, e.icmsPcm ?? 0) });
  }

  return {
    receita,
    receitaAcimaLc224: excedente,
    baseIrpj,
    baseCsll,
    linhas,
    total: linhas.reduce((s, l) => s + l.valor, 0),
    faltaAliquota,
  };
}

/**
 * IRPJ + adicional + CSLL do trimestre até agora, como na apuração real: o adicional
 * incide sobre a soma das bases que passar de R$ 20 mil × meses do trimestre já decorridos.
 */
export function irpjCsllTrimestre(meses: ResultadoPresumido[], p: ParametrosPresumido) {
  const baseIrpj = meses.reduce((s, m) => s + m.baseIrpj, 0);
  const baseCsll = meses.reduce((s, m) => s + m.baseCsll, 0);
  const adicional = aplicarPcm(Math.max(0, baseIrpj - p.irpjAdicionalLimiteMensal * meses.length), p.irpjAdicional);
  const irpj = aplicarPcm(baseIrpj, p.irpj);
  const csll = aplicarPcm(baseCsll, p.csll);
  const somaMensal = meses.reduce(
    (s, m) => s + m.linhas.filter((l) => l.chave === "irpj" || l.chave === "irpj_adicional" || l.chave === "csll").reduce((t, l) => t + l.valor, 0),
    0,
  );
  return { baseIrpj, baseCsll, irpj, adicional, csll, total: irpj + adicional + csll, diferencaDaSomaMensal: irpj + adicional + csll - somaMensal };
}
