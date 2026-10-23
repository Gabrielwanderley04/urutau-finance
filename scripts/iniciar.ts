/**
 * Primeiro uso sem complicação: npm run iniciar
 * 1. Se não houver .env, pede a connection string do banco (ex.: Neon) e cria o arquivo.
 * 2. Cria/atualiza as tabelas.
 * 3. Se o banco estiver vazio, coloca as empresas de exemplo.
 * 4. Abre o site em http://localhost:3000.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { criarConexao, normalizarUrl } from "../src/db";

const ARQUIVO = ".env";
const LOCAL = "postgres://urutau:urutau@localhost:5432/urutau";

function lerEnv(): Record<string, string> {
  if (!existsSync(ARQUIVO)) return {};
  return Object.fromEntries(
    readFileSync(ARQUIVO, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\s*[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

async function perguntarUrl(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nVamos configurar o banco de dados do urutau.");
  console.log("Cole a connection string do Neon (começa com postgresql://)");
  console.log("ou aperte Enter para usar um Postgres local (Docker).\n");
  const resposta = (await rl.question("Connection string: ")).trim();
  rl.close();
  if (!resposta) return LOCAL;
  if (!/^postgres(ql)?:\/\//.test(resposta.replace(/^["']/, ""))) {
    console.error("\nIsso não parece uma connection string (deveria começar com postgresql://). Rode de novo.");
    process.exit(1);
  }
  return normalizarUrl(resposta);
}

function rodar(comando: string, args: string[]) {
  return new Promise<number>((resolve) => {
    const p = spawn(comando, args, { stdio: "inherit", shell: process.platform === "win32" });
    p.on("exit", (codigo) => resolve(codigo ?? 1));
  });
}

let env = lerEnv();
if (!env.DATABASE_URL) {
  const url = await perguntarUrl();
  writeFileSync(ARQUIVO, `DATABASE_URL=${url}\n`);
  env = lerEnv();
  console.log(`\n✓ Arquivo ${ARQUIVO} criado.`);
}
const url = env.DATABASE_URL;
process.env.DATABASE_URL = url;

console.log("\nConectando ao banco e criando as tabelas…");
const { db, cliente } = criarConexao(url);
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
} catch (erro) {
  console.error("\n✗ Não consegui conectar ao banco:", erro instanceof Error ? erro.message : erro);
  console.error(url === LOCAL
    ? "  O Postgres local não está rodando. Use o Neon: apague o arquivo .env e rode npm run iniciar de novo."
    : "  Confira a connection string no arquivo .env (ou apague o .env e rode npm run iniciar de novo).");
  await cliente.end();
  process.exit(1);
}
const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from usuarios`);
await cliente.end();
console.log("✓ Tabelas prontas.");

if (n === 0) {
  console.log("\nBanco vazio: criando as empresas de exemplo (leva uns segundos)…");
  if ((await rodar("npm", ["run", "db:seed"])) !== 0) process.exit(1);
} else {
  console.log("✓ O banco já tem dados; nada foi apagado.");
}

console.log(`\nAbrindo o urutau em http://localhost:${process.env.PORT ?? 3000}  (para parar: Ctrl+C)`);
console.log("Entre com dono@urutau.dev / urutau123\n");
process.exit(await rodar("npx", ["next", "dev"]));
