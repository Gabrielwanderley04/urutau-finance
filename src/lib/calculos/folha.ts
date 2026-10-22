import { type Centavos, type Pcm, aplicarPcm, dividirArredondado } from "@/lib/dinheiro";
import { type Data, type Mes, diasNoMes, intervaloDoMes, mesDe } from "@/lib/datas";

export type Regime = "mei" | "simples" | "presumido" | "real";
export type AnexoServicos = string | null;

export interface AliquotasFolha {
  fgts: Pcm;
  inssPatronal: Pcm;
  rat: Pcm;
  terceiros: Pcm;
  /** CPP do MEI com empregado (LC 123, art. 18-C). */
  meiCpp: Pcm;
}

export type Encargos = "nenhum" | "mei_cpp" | "completos";

/**
 * Quais encargos patronais (INSS, RAT, terceiros) a empresa paga à parte da folha:
 * - Simples Anexos I, II, III e V: já estão dentro do DAS → nenhum.
 * - Simples Anexo IV, Lucro Presumido e Lucro Real → completos.
 * - MEI com empregado: só a CPP de 3%.
 * Empresa do Simples com comércio e serviços do Anexo IV: tratamos a folha toda como
 * Anexo IV (estimativa conservadora; o rateio exato fica para o contador).
 */
export function encargosDoRegime(regime: Regime, anexoServicos: AnexoServicos): Encargos {
  if (regime === "mei") return "mei_cpp";
  if (regime === "simples") return anexoServicos === "IV" ? "completos" : "nenhum";
  return "completos";
}

export interface Beneficios {
  valeTransporte: Centavos;
  valeRefeicao: Centavos;
  planoSaude: Centavos;
  outros: Centavos;
}

export interface CustoFuncionario {
  salario: Centavos;
  fgts: Centavos;
  provisao13: Centavos;
  provisaoFerias: Centavos;
  fgtsProvisoes: Centavos;
  inssPatronal: Centavos;
  rat: Centavos;
  terceiros: Centavos;
  beneficios: Centavos;
  /** Custo para o lucro (competência). */
  total: Centavos;
  /** O que sai do caixa no pagamento do mês: sem as provisões, que só saem no 13º e nas férias. */
  caixa: Centavos;
}

/**
 * Custo real de um funcionário no mês.
 *   FGTS = 8% do salário
 *   13º = salário ÷ 12
 *   Férias + 1/3 = salário ÷ 12 × 4/3 (= salário × 4 ÷ 36)
 *   FGTS sobre provisões = 8% × (13º + férias)
 *   Encargos patronais (se o regime exigir) incidem sobre salário + 13º + férias.
 * Cada parcela é arredondada uma vez, e o total é a soma das parcelas exibidas.
 */
export function calcularCustoFuncionario(
  salario: Centavos,
  beneficios: Beneficios,
  encargos: Encargos,
  a: AliquotasFolha,
): CustoFuncionario {
  const fgts = aplicarPcm(salario, a.fgts);
  const provisao13 = dividirArredondado(salario, 12);
  const provisaoFerias = dividirArredondado(BigInt(salario) * 4n, 36);
  const fgtsProvisoes = aplicarPcm(provisao13 + provisaoFerias, a.fgts);
  const baseEncargos = salario + provisao13 + provisaoFerias;

  let inssPatronal = 0;
  let rat = 0;
  let terceiros = 0;
  if (encargos === "completos") {
    inssPatronal = aplicarPcm(baseEncargos, a.inssPatronal);
    rat = aplicarPcm(baseEncargos, a.rat);
    terceiros = aplicarPcm(baseEncargos, a.terceiros);
  } else if (encargos === "mei_cpp") {
    inssPatronal = aplicarPcm(baseEncargos, a.meiCpp);
  }

  const totalBeneficios = beneficios.valeTransporte + beneficios.valeRefeicao + beneficios.planoSaude + beneficios.outros;
  const encargosTotais = inssPatronal + rat + terceiros;
  const total = salario + fgts + provisao13 + provisaoFerias + fgtsProvisoes + encargosTotais + totalBeneficios;

  return {
    salario,
    fgts,
    provisao13,
    provisaoFerias,
    fgtsProvisoes,
    inssPatronal,
    rat,
    terceiros,
    beneficios: totalBeneficios,
    total,
    // Provisões (e os encargos sobre elas) só saem do caixa quando o 13º e as férias forem pagos.
    caixa: salario + fgts + totalBeneficios + encargosSobre(salario, encargos, a),
  };
}

function encargosSobre(base: Centavos, encargos: Encargos, a: AliquotasFolha) {
  if (encargos === "nenhum") return 0;
  if (encargos === "completos") return aplicarPcm(base, a.inssPatronal) + aplicarPcm(base, a.rat) + aplicarPcm(base, a.terceiros);
  return aplicarPcm(base, a.meiCpp);
}

/**
 * Fração do mês trabalhada, em dias do "mês comercial" de 30 dias, como na folha:
 * admitido no dia 16 de um mês de 31 dias → 15 dias; mês cheio → 30.
 * Retorna 0 se o funcionário não trabalhou no mês.
 */
export function diasTrabalhados(mes: Mes, admissao: Data, desligamento: Data | null): number {
  const { inicio } = intervaloDoMes(mes);
  const fimDoMes = `${mes}-${String(diasNoMes(mes)).padStart(2, "0")}`;
  if (admissao > fimDoMes) return 0;
  if (desligamento && desligamento < inicio) return 0;
  const primeiro = mesDe(admissao) === mes ? Number(admissao.slice(8)) : 1;
  const ultimoReal = desligamento && mesDe(desligamento) === mes ? Number(desligamento.slice(8)) : diasNoMes(mes);
  // No mês comercial, o último dia do mês conta como dia 30.
  const ultimo = ultimoReal === diasNoMes(mes) ? 30 : Math.min(ultimoReal, 30);
  return Math.max(0, Math.min(30, ultimo - Math.min(primeiro, 30) + 1));
}

/** Salário proporcional aos dias trabalhados. */
export function salarioProporcional(salario: Centavos, dias: number): Centavos {
  if (dias >= 30) return salario;
  return dividirArredondado(BigInt(salario) * BigInt(dias), 30);
}

/** Benefícios também são proporcionais (VT/VR são por dia trabalhado). */
export function beneficiosProporcionais(b: Beneficios, dias: number): Beneficios {
  if (dias >= 30) return b;
  const p = (v: Centavos) => dividirArredondado(BigInt(v) * BigInt(dias), 30);
  return { valeTransporte: p(b.valeTransporte), valeRefeicao: p(b.valeRefeicao), planoSaude: b.planoSaude, outros: p(b.outros) };
}
