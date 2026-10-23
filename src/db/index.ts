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
    // Em servidor sem estado (Vercel), cada instância abre poucas conexões.
    max: process.env.VERCEL ? 1 : 10,
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
 */
export function urlDoBanco(semPooler = false): string | undefined {
  const e = process.env;
  return semPooler
    ? (e.DATABASE_URL_UNPOOLED ?? e.POSTGRES_URL_NON_POOLING ?? e.DATABASE_URL ?? e.POSTGRES_URL)
    : (e.DATABASE_URL ?? e.POSTGRES_URL);
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
