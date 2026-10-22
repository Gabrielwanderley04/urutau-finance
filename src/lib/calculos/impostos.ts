import type { Centavos } from "@/lib/dinheiro";
import { type Mes, somarMeses } from "@/lib/datas";
import { type AtividadeMei, type ResultadoMei, calcularMei } from "./mei";
import { type LinhaParametro, resolverParametro } from "./parametros";
import { type ParametrosPresumido, type ResultadoPresumido, calcularPresumido, irpjCsllTrimestre } from "./presumido";
import { type Anexo, type FaixaSimples, type ResultadoSimples, calcularSimples } from "./simples";

/** Valores mensais de uma empresa: receita separada por natureza e folha (para o Fator R). */
export interface ValoresMes {
  comercio: Centavos;
  servico: Centavos;
  folha: Centavos;
  /** Informado à mão para meses anteriores ao uso do sistema; substitui o calculado. */
  receitaHistorica?: Centavos | null;
  folhaHistorica?: Centavos | null;
}

export type Series = Map<Mes, ValoresMes>;

export const receitaTotal = (s: Series, m: Mes): Centavos => {
  const v = s.get(m);
  if (!v) return 0;
  return v.receitaHistorica ?? v.comercio + v.servico;
};
export const folhaTotal = (s: Series, m: Mes): Centavos => {
  const v = s.get(m);
  if (!v) return 0;
  return v.folhaHistorica ?? v.folha;
};

export interface EmpresaFiscal {
  regime: "mei" | "simples" | "presumido" | "real";
  atividade: AtividadeMei;
  anexoComercio: string | null;
  anexoServicos: string | null;
  sujeitoFatorR: boolean;
  aliquotaIssPcm: number | null;
  aliquotaIcmsPcm: number | null;
  /** Mês de início das atividades (AAAA-MM), se conhecido. */
  inicioAtividade: Mes | null;
}

export interface LinhaFaixa extends FaixaSimples {
  vigenciaInicio: string;
  vigenciaFim: string | null;
}

export interface TabelasFiscais {
  globais: LinhaParametro[];
  daEmpresa: LinhaParametro[];
  faixas: LinhaFaixa[];
}

export type ImpostoMes =
  | { regime: "mei"; total: Centavos; fixo: true; mei: ResultadoMei }
  | { regime: "simples"; total: Centavos; fixo: false; simples: ResultadoSimples }
  | { regime: "presumido"; total: Centavos; fixo: false; presumido: ResultadoPresumido; trimestre: ReturnType<typeof irpjCsllTrimestre> }
  | { regime: "real"; total: null }
  | { regime: "erro"; total: null; mensagem: string };

const ANEXOS: Anexo[] = ["I", "II", "III", "IV", "V"];

function faixasVigentes(faixas: LinhaFaixa[], data: string): Record<Anexo, FaixaSimples[]> {
  const r = Object.fromEntries(ANEXOS.map((a) => [a, [] as FaixaSimples[]])) as Record<Anexo, FaixaSimples[]>;
  for (const f of faixas) if (f.vigenciaInicio <= data && (f.vigenciaFim === null || f.vigenciaFim >= data)) r[f.anexo].push(f);
  return r;
}

function parametrosPresumido(t: TabelasFiscais, data: string): ParametrosPresumido {
  const p = (c: string) => resolverParametro(c, data, t.globais, t.daEmpresa);
  return {
    presuncaoIrpjComercio: p("lp_presuncao_irpj_comercio"),
    presuncaoIrpjServico: p("lp_presuncao_irpj_servico"),
    presuncaoCsllComercio: p("lp_presuncao_csll_comercio"),
    presuncaoCsllServico: p("lp_presuncao_csll_servico"),
    irpj: p("lp_irpj"),
    irpjAdicional: p("lp_irpj_adicional"),
    irpjAdicionalLimiteMensal: p("lp_irpj_adicional_limite_mensal"),
    csll: p("lp_csll"),
    pis: p("pis_cumulativo"),
    cofins: p("cofins_cumulativo"),
    lc224LimiteAnual: p("lc224_limite_anual"),
    lc224AcrescimoIrpj: p("lc224_acrescimo_irpj"),
    lc224AcrescimoCsll: p("lc224_acrescimo_csll"),
  };
}

function receitaAnoAntes(s: Series, mes: Mes): Centavos {
  let total = 0;
  for (let m = `${mes.slice(0, 4)}-01`; m < mes; m = somarMeses(m, 1)) total += receitaTotal(s, m);
  return total;
}

function presumidoDoMes(e: EmpresaFiscal, mes: Mes, s: Series, t: TabelasFiscais) {
  const v = s.get(mes) ?? { comercio: 0, servico: 0, folha: 0 };
  return calcularPresumido({
    receitaComercio: v.comercio,
    receitaServico: v.servico,
    receitaAnoAntes: receitaAnoAntes(s, mes),
    issPcm: e.aliquotaIssPcm,
    icmsPcm: e.aliquotaIcmsPcm,
    p: parametrosPresumido(t, `${mes}-01`),
  });
}

/** Imposto estimado do mês, conforme o regime. Funções puras: tudo vem por parâmetro. */
export function calcularImpostoMes(e: EmpresaFiscal, mes: Mes, s: Series, t: TabelasFiscais): ImpostoMes {
  const data = `${mes}-01`;
  const p = (c: string) => resolverParametro(c, data, t.globais, t.daEmpresa);
  try {
    if (e.regime === "real") return { regime: "real", total: null };

    if (e.regime === "mei") {
      let faturamentoAno = 0;
      for (let m = `${mes.slice(0, 4)}-01`; m <= mes; m = somarMeses(m, 1)) faturamentoAno += receitaTotal(s, m);
      const mei = calcularMei({
        mes,
        faturamentoAno,
        atividade: e.atividade,
        dasPorAtividade: { comercio: p("mei_das_comercio"), servicos: p("mei_das_servicos"), ambos: p("mei_das_ambos") },
        limiteAnual: p("mei_limite_anual"),
        alerta: p("mei_alerta"),
        inicioAtividade: e.inicioAtividade,
      });
      // Antes de abrir, não há DAS.
      const ativo = !e.inicioAtividade || e.inicioAtividade <= mes;
      return { regime: "mei", total: ativo ? mei.das : 0, fixo: true, mei };
    }

    if (e.regime === "simples") {
      const v = s.get(mes) ?? { comercio: 0, servico: 0, folha: 0 };
      const simples = calcularSimples({
        mes,
        receitaComercio: v.comercio,
        receitaServico: v.servico,
        receitaTotalDe: (m) => receitaTotal(s, m),
        folhaDe: (m) => folhaTotal(s, m),
        inicioAtividade: e.inicioAtividade,
        anexoComercio: (e.anexoComercio as Anexo | null) ?? null,
        anexoServicos: (e.anexoServicos as Anexo | null) ?? null,
        sujeitoFatorR: e.sujeitoFatorR,
        tabelas: faixasVigentes(t.faixas, data),
        fatorRMinimo: p("fator_r_minimo"),
        limiteAnual: p("simples_limite_anual"),
        sublimite: p("simples_sublimite"),
      });
      return { regime: "simples", total: simples.total, fixo: false, simples };
    }

    const presumido = presumidoDoMes(e, mes, s, t);
    // Meses do trimestre até este, para mostrar a apuração trimestral real.
    const posicao = (Number(mes.slice(5, 7)) - 1) % 3;
    const meses = Array.from({ length: posicao + 1 }, (_, i) => somarMeses(mes, i - posicao));
    const trimestre = irpjCsllTrimestre(
      meses.map((m) => (m === mes ? presumido : presumidoDoMes(e, m, s, t))),
      parametrosPresumido(t, data),
    );
    return { regime: "presumido", total: presumido.total, fixo: false, presumido, trimestre };
  } catch (erro) {
    return { regime: "erro", total: null, mensagem: erro instanceof Error ? erro.message : "Parâmetro fiscal ausente" };
  }
}
