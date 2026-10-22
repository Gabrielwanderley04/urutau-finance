/**
 * Dinheiro é sempre inteiro em centavos. Percentuais são inteiros em "pcm"
 * (por cem mil): 1% = 1.000 pcm, 0,65% = 650 pcm. Nenhum float participa
 * de cálculo; arredondamos uma única vez, no fim, com divisão inteira.
 */

export type Centavos = number;
export type Pcm = number;

export const PCM_100 = 100_000;

export function assertCentavos(v: number, nome = "valor"): Centavos {
  if (!Number.isSafeInteger(v)) throw new Error(`${nome} precisa ser um inteiro em centavos`);
  return v;
}

/** a ÷ b arredondando metade para longe do zero (half-up para positivos). */
export function dividirArredondado(a: bigint | number, b: bigint | number): number {
  const n = BigInt(a);
  const d = BigInt(b);
  if (d === 0n) throw new Error("divisão por zero");
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return Number(neg ? -q : q);
}

/** a ÷ b arredondando para cima (teto), para valores não negativos. */
export function dividirParaCima(a: bigint | number, b: bigint | number): number {
  const n = BigInt(a);
  const d = BigInt(b);
  if (d <= 0n || n < 0n) throw new Error("dividirParaCima aceita só valores positivos");
  return Number((n + d - 1n) / d);
}

/** valor × percentual, arredondado em centavos. */
export function aplicarPcm(valor: Centavos, pcm: Pcm): Centavos {
  return dividirArredondado(BigInt(valor) * BigInt(pcm), PCM_100);
}

/** parte ÷ total em pcm (ex.: participação, margem). null se total = 0. */
export function razaoPcm(parte: number, total: number): Pcm | null {
  if (total === 0) return null;
  return dividirArredondado(BigInt(parte) * BigInt(PCM_100), total);
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarReais(c: Centavos): string {
  // Intl recebe o valor já dividido apenas para exibição; o cálculo nunca usa isso.
  const sinal = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const reais = Math.trunc(abs / 100);
  const cent = abs % 100;
  const corpo = fmtBRL.format(reais).replace(/,00$/, "");
  return `${sinal}${corpo},${String(cent).padStart(2, "0")}`;
}

/** Formata pcm como percentual brasileiro: 28000 → "28%", 650 → "0,65%". */
export function formatarPcm(p: Pcm, casas = 2): string {
  const sinal = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  const escala = 10 ** (3 - casas); // pcm tem 3 casas além do "%"
  const arred = dividirArredondado(abs, escala);
  const inteiro = Math.trunc(arred / 10 ** casas);
  const frac = String(arred % 10 ** casas).padStart(casas, "0").replace(/0+$/, "");
  return `${sinal}${inteiro.toLocaleString("pt-BR")}${frac ? "," + frac : ""}%`;
}

/**
 * Converte o que o usuário digitou ("1.234,56", "1234,5", "R$ 10", "10.50")
 * em centavos, sem passar por float. Retorna null se não for um valor válido.
 */
export function lerReais(entrada: string): Centavos | null {
  let s = entrada.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  let negativo = false;
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  let inteiro: string;
  let frac = "";
  if (s.includes(",")) {
    // padrão brasileiro: ponto é milhar, vírgula é decimal
    const [i, f, ...resto] = s.split(",");
    if (resto.length) return null;
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(i)) return null;
    inteiro = i.replace(/\./g, "");
    frac = f;
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // "10.50" digitado em teclado americano
    [inteiro, frac] = s.split(".");
  } else {
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(s)) return null;
    inteiro = s.replace(/\./g, "");
  }
  if (!/^\d*$/.test(frac) || frac.length > 2) return null;
  const c = Number(inteiro || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(c)) return null;
  return negativo ? -c : c;
}

/** Centavos → texto para preencher um input ("1234,56"). */
export function centavosParaInput(c: Centavos): string {
  const abs = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Lê percentual digitado ("2,5" ou "2,5%") como pcm. */
export function lerPercentual(entrada: string): Pcm | null {
  const s = entrada.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return Number(i) * 1000 + Number(f.padEnd(3, "0"));
}
