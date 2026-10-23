import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { criarConexao, descreverBanco, urlDoBanco } from "../src/db";

const url = process.argv[2] ?? urlDoBanco();
if (!url) {
  console.error("\n✗ Nenhum banco de dados configurado: falta a variável DATABASE_URL.");
  if (process.env.VERCEL) {
    const parecidas = Object.keys(process.env).filter((k) => /^(DATABASE|POSTGRES|PG|NEON)/.test(k));
    console.error("  Na Vercel: abra o projeto → Storage → Create Database → Neon → conecte ao projeto");
    console.error("  (marcando Production) e depois faça Redeploy.");
    console.error(`  Variáveis de banco encontradas neste deploy: ${parecidas.length ? parecidas.join(", ") : "nenhuma"}.`);
  }
  process.exit(1);
}
const { db, cliente } = criarConexao(url);
await migrate(db, { migrationsFolder: "./drizzle" });
await cliente.end();
console.log(`Migrações aplicadas em ${descreverBanco(url)}.`);
