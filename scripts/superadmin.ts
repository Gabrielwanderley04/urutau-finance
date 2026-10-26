/**
 * Dá (ou tira) acesso ao painel Urutau, que enxerga todas as empresas.
 * A pessoa precisa ter criado a conta antes (em /criar-conta).
 *
 *   npm run admin -- pessoa@urutau.com.br          → vira equipe Urutau
 *   npm run admin -- pessoa@urutau.com.br --remover → deixa de ser
 *
 * No banco publicado: DATABASE_URL="<connection string>" npm run admin -- ...
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { criarConexao, descreverBanco, urlDoBanco } from "../src/db";
import { usuarios } from "../src/db/schema";

const email = process.argv[2]?.trim().toLowerCase();
const remover = process.argv.includes("--remover");
if (!email || !email.includes("@")) {
  console.error("Uso: npm run admin -- email@exemplo.com [--remover]");
  process.exit(1);
}
const url = urlDoBanco();
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}
const { db, cliente } = criarConexao(url);
const [u] = await db.update(usuarios).set({ superadmin: !remover }).where(eq(usuarios.email, email)).returning({ nome: usuarios.nome });
await cliente.end();
if (!u) {
  console.error(`Nenhuma conta com ${email} em ${descreverBanco(url)}. Crie a conta em /criar-conta e rode de novo.`);
  process.exit(1);
}
console.log(`${u.nome} (${email}) ${remover ? "não é mais" : "agora é"} equipe Urutau em ${descreverBanco(url)}.`);
