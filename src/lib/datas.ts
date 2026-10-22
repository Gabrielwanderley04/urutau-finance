/** Datas de negócio são strings "AAAA-MM-DD"; meses são "AAAA-MM". Fuso: São Paulo. */

export type Mes = string;
export type Data = string;

const FUSO = "America/Sao_Paulo";

export function hoje(agora = new Date()): Data {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

export function mesDe(data: Data): Mes {
  return data.slice(0, 7);
}

export function mesAtual(agora = new Date()): Mes {
  return mesDe(hoje(agora));
}

export function mesValido(m: string | undefined | null): m is Mes {
  return !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function dataValida(d: string | undefined | null): d is Data {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [a, m, dia] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dia));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dia;
}

export function somarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function somarDias(data: Data, n: number): Data {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Intervalo [inicio, fim) do mês. */
export function intervaloDoMes(mes: Mes): { inicio: Data; fim: Data } {
  return { inicio: `${mes}-01`, fim: `${somarMeses(mes, 1)}-01` };
}

export function diasNoMes(mes: Mes): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Os n meses que terminam em `mes` (inclusive), do mais antigo ao mais recente. */
export function ultimosMeses(mes: Mes, n: number): Mes[] {
  return Array.from({ length: n }, (_, i) => somarMeses(mes, i - n + 1));
}

const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function nomeDoMes(mes: Mes, curto = false): string {
  const [a, m] = mes.split("-").map(Number);
  const nome = NOMES[m - 1];
  return curto ? `${nome.slice(0, 3)}/${String(a).slice(2)}` : `${nome} de ${a}`;
}

export function formatarData(data: Data): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export function formatarDataCurta(data: Data): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}
