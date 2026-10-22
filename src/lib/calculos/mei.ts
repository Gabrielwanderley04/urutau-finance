import { type Centavos, type Pcm, PCM_100, dividirArredondado, razaoPcm } from "@/lib/dinheiro";
import type { Mes } from "@/lib/datas";

export type AtividadeMei = "comercio" | "servicos" | "ambos";

export type SituacaoMei = "ok" | "alerta" | "acima_do_limite" | "acima_20_porcento";

export interface ResultadoMei {
  das: Centavos;
  faturamentoAno: Centavos;
  limite: Centavos;
  /** Limite proporcional quando a empresa abriu no próprio ano (R$ 6.750 por mês). */
  limiteProporcional: boolean;
  usoDoLimite: Pcm;
  situacao: SituacaoMei;
  /** Quanto ainda pode faturar no ano sem passar do limite. */
  folga: Centavos;
}

/**
 * MEI: DAS fixo mensal conforme a atividade e acompanhamento do limite anual.
 * - Abriu no próprio ano: limite proporcional, R$ 81 mil ÷ 12 por mês de atividade (inclui o mês de abertura).
 * - Passou do limite em até 20%: paga a diferença como Simples e sai do MEI no ano seguinte.
 * - Passou mais de 20%: desenquadramento retroativo a janeiro (ou à abertura).
 */
export function calcularMei(e: {
  mes: Mes;
  faturamentoAno: Centavos;
  dasPorAtividade: Record<AtividadeMei, Centavos>;
  atividade: AtividadeMei;
  limiteAnual: Centavos;
  alerta: Pcm;
  inicioAtividade: Mes | null;
}): ResultadoMei {
  const ano = e.mes.slice(0, 4);
  let limite = e.limiteAnual;
  let limiteProporcional = false;
  if (e.inicioAtividade && e.inicioAtividade.slice(0, 4) === ano) {
    const meses = 12 - Number(e.inicioAtividade.slice(5, 7)) + 1;
    limite = dividirArredondado(BigInt(e.limiteAnual) * BigInt(meses), 12);
    limiteProporcional = meses < 12;
  }
  const uso = razaoPcm(e.faturamentoAno, limite) ?? 0;
  const situacao: SituacaoMei =
    uso > PCM_100 + PCM_100 / 5 ? "acima_20_porcento" : uso > PCM_100 ? "acima_do_limite" : uso >= e.alerta ? "alerta" : "ok";
  return {
    das: e.dasPorAtividade[e.atividade],
    faturamentoAno: e.faturamentoAno,
    limite,
    limiteProporcional,
    usoDoLimite: uso,
    situacao,
    folga: limite - e.faturamentoAno,
  };
}
