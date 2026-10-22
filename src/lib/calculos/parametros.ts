import type { Data } from "@/lib/datas";

/**
 * Parâmetros fiscais (alíquotas, limites, valores) vêm de tabelas com vigência,
 * nunca do código. A empresa pode sobrescrever alguns (ex.: RAT ajustado pelo FAP).
 */
export interface LinhaParametro {
  chave: string;
  valor: number;
  vigenciaInicio: Data;
  /** Inclusivo; null = sem fim. */
  vigenciaFim: Data | null;
}

function vigente(linhas: LinhaParametro[], chave: string, data: Data): LinhaParametro | undefined {
  return linhas
    .filter((l) => l.chave === chave && l.vigenciaInicio <= data && (l.vigenciaFim === null || l.vigenciaFim >= data))
    .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0];
}

/** Valor vigente na data: o da empresa tem prioridade sobre o global. */
export function resolverParametro(
  chave: string,
  data: Data,
  globais: LinhaParametro[],
  daEmpresa: LinhaParametro[] = [],
): number {
  const l = vigente(daEmpresa, chave, data) ?? vigente(globais, chave, data);
  if (!l) throw new Error(`Parâmetro "${chave}" sem valor vigente em ${data}. Cadastre-o na tabela de parâmetros.`);
  return l.valor;
}

export function resolverVarios<K extends string>(
  chaves: readonly K[],
  data: Data,
  globais: LinhaParametro[],
  daEmpresa: LinhaParametro[] = [],
): Record<K, number> {
  return Object.fromEntries(chaves.map((c) => [c, resolverParametro(c, data, globais, daEmpresa)])) as Record<K, number>;
}
