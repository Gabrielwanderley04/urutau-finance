import { type Centavos, type Pcm, PCM_100, dividirArredondado } from "@/lib/dinheiro";
import { type Data, diasNoMes, mesDe, somarMeses } from "@/lib/datas";

/**
 * Parcela pela tabela Price, calculada com frações exatas (BigInt), sem float:
 *   PMT = S × i ÷ (1 − (1 + i)^−n) = S × j × (P + j)^n ÷ (P × ((P + j)^n − P^n)),
 * com i = j ÷ P e P = 100.000 (escala pcm).
 */
export function parcelaPrice(saldo: Centavos, jurosMensais: Pcm, n: number): Centavos {
  if (n <= 0) throw new Error("número de parcelas precisa ser positivo");
  if (jurosMensais === 0) return dividirArredondado(saldo, n);
  const P = BigInt(PCM_100);
  const j = BigInt(jurosMensais);
  const fator = (P + j) ** BigInt(n);
  const pn = P ** BigInt(n);
  return dividirArredondado(BigInt(saldo) * j * fator, P * (fator - pn));
}

export interface Parcela {
  numero: number;
  vencimento: Data;
  valor: Centavos;
  /** Entra como despesa no mês do vencimento. */
  juros: Centavos;
  /** Reduz o saldo devedor e o caixa, mas não é despesa. */
  amortizacao: Centavos;
  saldoApos: Centavos;
}

export interface EntradaDivida {
  saldoDevedor: Centavos;
  jurosMensais: Pcm;
  numParcelas: number;
  /** Valor da parcela do contrato; se ausente, usamos a tabela Price. */
  valorParcela?: Centavos | null;
  primeiroVencimento: Data;
  diaVencimento: number;
}

export type AvisoDivida =
  | { tipo: "parcela_menor_que_juros"; juros: Centavos }
  | { tipo: "ajuste_ultima_parcela"; diferenca: Centavos }
  | { tipo: "quitada_antes"; parcelas: number };

export interface Cronograma {
  parcelas: Parcela[];
  valorParcela: Centavos;
  totalJuros: Centavos;
  totalPago: Centavos;
  avisos: AvisoDivida[];
}

/** Vencimento da k-ésima parcela (k a partir de 0), respeitando meses curtos (dia 31 → 30/28). */
export function vencimentoParcela(primeiro: Data, dia: number, k: number): Data {
  if (k === 0) return primeiro;
  const mes = somarMeses(mesDe(primeiro), k);
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, "0")}`;
}

/**
 * Gera as parcelas separando juros de amortização:
 *   juros = saldo × taxa; amortização = parcela − juros; saldo −= amortização.
 * A última parcela absorve a diferença de arredondamento para o saldo fechar em zero.
 */
export function gerarCronograma(e: EntradaDivida): Cronograma {
  const avisos: AvisoDivida[] = [];
  const valorParcela = e.valorParcela ?? parcelaPrice(e.saldoDevedor, e.jurosMensais, e.numParcelas);
  const parcelas: Parcela[] = [];
  let saldo = e.saldoDevedor;

  const jurosIniciais = dividirArredondado(BigInt(saldo) * BigInt(e.jurosMensais), PCM_100);
  if (valorParcela <= jurosIniciais && e.numParcelas > 1) {
    avisos.push({ tipo: "parcela_menor_que_juros", juros: jurosIniciais });
  }

  for (let k = 0; k < e.numParcelas && saldo > 0; k++) {
    const juros = dividirArredondado(BigInt(saldo) * BigInt(e.jurosMensais), PCM_100);
    const ultima = k === e.numParcelas - 1;
    let amortizacao = valorParcela - juros;
    if (ultima || amortizacao >= saldo) amortizacao = saldo;
    if (amortizacao < 0) amortizacao = 0;
    const valor = juros + amortizacao;
    saldo -= amortizacao;
    parcelas.push({ numero: k + 1, vencimento: vencimentoParcela(e.primeiroVencimento, e.diaVencimento, k), valor, juros, amortizacao, saldoApos: saldo });
  }

  const ultima = parcelas.at(-1);
  if (ultima && parcelas.length === e.numParcelas && Math.abs(ultima.valor - valorParcela) > e.numParcelas) {
    // Diferença maior que os centavos de arredondamento: o valor informado não fecha com a taxa.
    avisos.push({ tipo: "ajuste_ultima_parcela", diferenca: ultima.valor - valorParcela });
  }
  if (parcelas.length < e.numParcelas) avisos.push({ tipo: "quitada_antes", parcelas: parcelas.length });

  const totalJuros = parcelas.reduce((s, p) => s + p.juros, 0);
  return { parcelas, valorParcela, totalJuros, totalPago: e.saldoDevedor + totalJuros, avisos };
}

export interface ParcelaSituacao {
  vencimento: Data;
  valor: Centavos;
  amortizacao: Centavos;
  status: "pago" | "a_pagar";
  pagoEm: Data | null;
}

/** Saldo devedor (principal) em uma data: amortização das parcelas ainda não pagas naquela data. */
export function saldoDevedorEm(parcelas: ParcelaSituacao[], data: Data): Centavos {
  return parcelas
    .filter((p) => p.status === "a_pagar" || (p.pagoEm !== null && p.pagoEm >= data))
    .reduce((s, p) => s + p.amortizacao, 0);
}
