import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function criarConexao(url: string) {
  const cliente = postgres(url, { max: 10 });
  return { db: drizzle(cliente, { schema }), cliente };
}

export type BancoDeDados = ReturnType<typeof criarConexao>["db"];

const globalParaDb = globalThis as unknown as { __urutauDb?: BancoDeDados };

/** Conexão única por processo (o hot reload do Next recria módulos). */
export function obterDb(): BancoDeDados {
  if (!globalParaDb.__urutauDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalParaDb.__urutauDb = criarConexao(url).db;
  }
  return globalParaDb.__urutauDb;
}
