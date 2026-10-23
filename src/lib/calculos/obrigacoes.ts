import type { Centavos } from "@/lib/dinheiro";
import { type Data, type Mes, diaNoMes, diaUtilAnterior, nomeDoMes, proximoDiaUtil, somarMeses, ultimoDiaUtil } from "@/lib/datas";
import type { ImpostoMes } from "./impostos";

export interface Obrigacao {
  /** Chave única: impede gerar a mesma guia duas vezes. */
  referencia: string;
  descricao: string;
  valor: Centavos;
  vencimento: Data;
}

/**
 * Guias de imposto de uma competência (mês das vendas), com o vencimento de cada uma:
 * - DAS (MEI e Simples): dia 20 do mês seguinte; fim de semana → próximo dia útil.
 * - PIS e Cofins: dia 25 do mês seguinte; fim de semana → dia útil anterior.
 * - ISS e ICMS: dia 10 do mês seguinte (referência; cada prefeitura/estado tem o seu calendário).
 * - IRPJ e CSLL: trimestrais, último dia útil do mês seguinte ao fim do trimestre.
 */
export function obrigacoesDaCompetencia(competencia: Mes, imposto: ImpostoMes): Obrigacao[] {
  const seguinte = somarMeses(competencia, 1);
  const nome = nomeDoMes(competencia);
  if (imposto.regime === "mei" || imposto.regime === "simples") {
    if (!imposto.total) return [];
    return [{ referencia: `imposto:das:${competencia}`, descricao: `DAS de ${nome}`, valor: imposto.total, vencimento: proximoDiaUtil(diaNoMes(seguinte, 20)) }];
  }
  if (imposto.regime !== "presumido") return [];

  const valor = (...chaves: string[]) => imposto.presumido.linhas.filter((l) => chaves.includes(l.chave)).reduce((s, l) => s + l.valor, 0);
  const lista: Obrigacao[] = [
    { referencia: `imposto:pis_cofins:${competencia}`, descricao: `PIS e Cofins de ${nome}`, valor: valor("pis", "cofins"), vencimento: diaUtilAnterior(diaNoMes(seguinte, 25)) },
    { referencia: `imposto:iss:${competencia}`, descricao: `ISS de ${nome} (confira o vencimento na prefeitura)`, valor: valor("iss"), vencimento: proximoDiaUtil(diaNoMes(seguinte, 10)) },
    { referencia: `imposto:icms:${competencia}`, descricao: `ICMS de ${nome} (confira o vencimento no estado)`, valor: valor("icms"), vencimento: proximoDiaUtil(diaNoMes(seguinte, 10)) },
  ];
  // No último mês do trimestre, o IRPJ e a CSLL do trimestre inteiro.
  if (Number(competencia.slice(5, 7)) % 3 === 0) {
    const t = Number(competencia.slice(5, 7)) / 3;
    lista.push({
      referencia: `imposto:irpj_csll:${competencia}`,
      descricao: `IRPJ e CSLL do ${t}º trimestre de ${competencia.slice(0, 4)}`,
      valor: imposto.trimestre.total,
      vencimento: ultimoDiaUtil(seguinte),
    });
  }
  return lista.filter((o) => o.valor > 0);
}
