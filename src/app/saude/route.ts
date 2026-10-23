import { sql } from "drizzle-orm";
import { descreverBanco, obterDb, urlDoBanco } from "@/db";
import { hashSenha } from "@/lib/servidor/auth";

export const dynamic = "force-dynamic";

/** Motivo real do erro (o Drizzle embrulha o erro do banco em "Failed query"), sem connection strings. */
function limpar(e: unknown): string {
  const causa = e instanceof Error && e.cause instanceof Error ? e.cause : e;
  const texto = causa instanceof Error ? causa.message : String(causa);
  return texto.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***");
}

/**
 * Diagnóstico da publicação: banco, tabelas e senhas. Não mostra dados nem segredos.
 * Abra /saude no navegador e veja o que está "erro".
 */
export async function GET() {
  const r: Record<string, unknown> = {
    banco_configurado: descreverBanco(urlDoBanco()),
    variaveis_de_banco: Object.keys(process.env).filter((k) => /^(DATABASE|POSTGRES|PG|NEON)/.test(k)).sort(),
  };
  try {
    await obterDb().execute(sql`select 1`);
    r.conexao = "ok";
    try {
      const [{ n }] = await obterDb().execute<{ n: number }>(sql`select count(*)::int as n from usuarios`);
      r.tabelas = "ok";
      r.usuarios_cadastrados = n;
    } catch (e) {
      r.tabelas = `erro: ${limpar(e)} (as migrações não rodaram neste banco)`;
    }
  } catch (e) {
    r.conexao = `erro: ${limpar(e)}`;
  }
  try {
    await hashSenha("teste-de-saude");
    r.senhas = "ok";
  } catch (e) {
    r.senhas = `erro: ${limpar(e)}`;
  }
  const ok = r.conexao === "ok" && r.tabelas === "ok" && r.senhas === "ok";
  return Response.json({ tudo_certo: ok, ...r }, { status: ok ? 200 : 500 });
}
