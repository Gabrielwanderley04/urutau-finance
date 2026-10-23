import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Ajusta a connection string copiada do painel do banco: o parâmetro channel_binding (que o Neon
 * inclui) não é aceito pelo driver e seria repassado ao servidor como configuração desconhecida.
 */
export function normalizarUrl(url: string): string {
  return url
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/([?&])channel_binding=[^&]*&?/, "$1")
    .replace(/[?&]$/, "");
}

export function criarConexao(url: string) {
  const cliente = postgres(normalizarUrl(url), {
    // Na Vercel, poucas conexões por instância (o pooler do Neon aguenta), mas mais de uma:
    // uma tela faz dezenas de consultas e, com uma conexão só, elas iriam em fila.
    max: process.env.VERCEL ? 5 : 10,
    // Poolers como o do Neon (PgBouncer em modo transação) não aceitam prepared statements.
    prepare: false,
    // Avisos do servidor como "schema já existe" não interessam ao usuário.
    onnotice: () => {},
  });
  return { db: drizzle(cliente, { schema }), cliente };
}

export type BancoDeDados = ReturnType<typeof criarConexao>["db"];

const globalParaDb = globalThis as unknown as { __urutauDb?: BancoDeDados };

/**
 * Endereço do banco. Aceita os nomes criados pela integração Neon da Vercel
 * (DATABASE_URL) e pelo antigo Vercel Postgres (POSTGRES_URL).
 * Migrações e site usam sempre o MESMO endereço: se existissem dois bancos configurados,
 * as tabelas poderiam ser criadas num e o site ler do outro.
 */
export function urlDoBanco(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

/** Só o servidor e o banco (sem usuário e senha), para mensagens de diagnóstico. */
export function descreverBanco(url: string | undefined): string {
  if (!url) return "nenhum";
  try {
    const u = new URL(normalizarUrl(url));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "endereço inválido";
  }
}

/** Conexão única por processo (o hot reload do Next recria módulos). */
export function obterDb(): BancoDeDados {
  if (!globalParaDb.__urutauDb) {
    const url = urlDoBanco();
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalParaDb.__urutauDb = criarConexao(url).db;
  }
  return globalParaDb.__urutauDb;
}
