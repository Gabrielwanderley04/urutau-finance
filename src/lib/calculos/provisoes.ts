import { type Centavos, aplicarPcm, dividirArredondado } from "@/lib/dinheiro";
import { type Data, type Mes, diasNoMes, mesDe } from "@/lib/datas";
import type { AliquotasFolha, Encargos } from "./folha";

/**
 * Avos do 13º no ano: cada mês em que o funcionário trabalhou 15 dias ou mais conta 1/12.
 */
export function avos13(ano: number, admissao: Data, desligamento: Data | null): number {
  let avos = 0;
  for (let m = 1; m <= 12; m++) {
    const mes: Mes = `${ano}-${String(m).padStart(2, "0")}`;
    const primeiro = mesDe(admissao) === mes ? Number(admissao.slice(8)) : admissao < `${mes}-01` ? 1 : null;
    if (primeiro === null) continue;
    if (desligamento && desligamento < `${mes}-01`) continue;
    const ultimo = desligamento && mesDe(desligamento) === mes ? Number(desligamento.slice(8)) : diasNoMes(mes);
    if (ultimo - primeiro + 1 >= 15) avos++;
  }
  return avos;
}

export interface SugestaoPagamento {
  bruto: Centavos;
  fgts: Centavos;
  encargos: Centavos;
  /** O que sai do caixa da empresa. */
  total: Centavos;
}

/**
 * Valor sugerido para registrar o pagamento:
 * - 13º: salário × avos ÷ 12;
 * - férias (30 dias): salário + 1/3.
 * Mais FGTS e, se o regime exigir, encargos patronais.
 */
export function sugerirPagamento(
  tipo: "decimo_terceiro" | "ferias",
  salario: Centavos,
  avos: number,
  encargos: Encargos,
  a: AliquotasFolha,
): SugestaoPagamento {
  const bruto = tipo === "decimo_terceiro" ? dividirArredondado(BigInt(salario) * BigInt(avos), 12) : dividirArredondado(BigInt(salario) * 4n, 3);
  const fgts = aplicarPcm(bruto, a.fgts);
  const enc =
    encargos === "completos"
      ? aplicarPcm(bruto, a.inssPatronal) + aplicarPcm(bruto, a.rat) + aplicarPcm(bruto, a.terceiros)
      : encargos === "mei_cpp"
        ? aplicarPcm(bruto, a.meiCpp)
        : 0;
  return { bruto, fgts, encargos: enc, total: bruto + fgts + enc };
}
