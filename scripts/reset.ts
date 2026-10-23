import "dotenv/config";
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL!;
// Apagar o banco inteiro só é permitido em banco local, a não ser que se peça explicitamente.
const local = /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(url);
if (!local && !process.argv.includes("--apagar-banco-remoto")) {
  console.error("db:reset apaga TODOS os dados. Recusado: o banco não é local.");
  console.error("Se for mesmo isso, rode: npx tsx scripts/reset.ts <url> --apagar-banco-remoto");
  process.exit(1);
}
const sql = postgres(url);
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
console.log("Banco zerado.");
