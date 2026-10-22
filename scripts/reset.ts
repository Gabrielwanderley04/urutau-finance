import "dotenv/config";
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_URL!;
const sql = postgres(url);
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
console.log("Banco zerado.");
