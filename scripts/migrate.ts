import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { criarConexao } from "../src/db";

// Migrações preferem a conexão direta (sem pooler); a integração Neon + Vercel cria DATABASE_URL_UNPOOLED.
const url = process.argv[2] ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (ou DATABASE_URL_UNPOOLED) para aplicar as migrações.");
  process.exit(1);
}
const { db, cliente } = criarConexao(url);
await migrate(db, { migrationsFolder: "./drizzle" });
await cliente.end();
console.log("Migrações aplicadas.");
