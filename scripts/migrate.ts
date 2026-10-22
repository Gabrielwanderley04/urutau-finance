import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { criarConexao } from "../src/db";

const url = process.argv[2] ?? process.env.DATABASE_URL!;
const { db, cliente } = criarConexao(url);
await migrate(db, { migrationsFolder: "./drizzle" });
await cliente.end();
console.log("Migrações aplicadas.");
