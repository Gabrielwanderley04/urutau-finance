import type { Centavos } from "@/lib/dinheiro";
import { formatarData } from "@/lib/datas";

/**
 * CSV no formato que o Excel em português abre direto:
 * separador ";", vírgula decimal, BOM UTF-8 para os acentos e quebra de linha CRLF.
 */
export type Celula = string | number | null | undefined | { centavos: Centavos } | { data: string };

export const reais = (centavos: Centavos): Celula => ({ centavos });
export const data = (d: string | null): Celula => (d ? { data: d } : "");

/** Centavos → "1234,56" (sem separador de milhar, para o Excel tratar como número). */
export function valorCsv(c: Centavos): string {
  const abs = Math.abs(c);
  return `${c < 0 ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function texto(c: Celula): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "object") return "centavos" in c ? valorCsv(c.centavos) : formatarData(c.data);
  return String(c);
}

function escapar(s: string): string {
  // Fórmulas começando com =, +, -, @ são neutralizadas (proteção contra CSV injection).
  const seguro = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function gerarCsv(cabecalho: string[], linhas: Celula[][]): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map((c) => escapar(texto(c))).join(";")).join("\r\n");
  return `﻿${corpo}\r\n`;
}
