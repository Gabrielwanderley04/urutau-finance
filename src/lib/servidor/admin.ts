import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { auditoria, empresaModulos, empresaUsuarios, empresas, usuarios, vendas } from "@/db/schema";
import { modulosAtivos } from "@/lib/perfis";

/** Consultas do painel Urutau. Quem chama já passou por exigirSuperadmin. */

export async function listarEmpresasAdmin(db: BancoDeDados) {
  const [lista, escolhas] = await Promise.all([
    db
      .select({
        id: empresas.id,
        nome: empresas.nome,
        perfil: empresas.perfil,
        cidade: empresas.cidade,
        uf: empresas.uf,
        criadoEm: empresas.criadoEm,
        // Colunas de fora escritas com o nome da tabela: dentro da subconsulta, "id" seria a coluna de dentro.
        membros: sql<number>`(select count(*)::int from ${empresaUsuarios} eu where eu.empresa_id = "empresas"."id")`,
        donos: sql<string>`(select coalesce(string_agg(u.email, ', ' order by u.email), '') from ${empresaUsuarios} eu join ${usuarios} u on u.id = eu.usuario_id where eu.empresa_id = "empresas"."id" and eu.papel = 'dono')`,
        aConferir: sql<number>`(select count(*)::int from ${vendas} v where v.empresa_id = "empresas"."id" and v.conferido_em is null and v.excluido_em is null)`,
      })
      .from(empresas)
      .orderBy(asc(empresas.nome)),
    db.select().from(empresaModulos),
  ]);
  return lista.map((e) => ({ ...e, modulos: modulosAtivos(e.perfil, escolhas.filter((x) => x.empresaId === e.id)) }));
}

export async function obterEmpresaAdmin(db: BancoDeDados, id: string) {
  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, id)).limit(1);
  if (!empresa) return null;
  const [membros, escolhas, eventos] = await Promise.all([
    db
      .select({ usuarioId: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: empresaUsuarios.papel })
      .from(empresaUsuarios)
      .innerJoin(usuarios, eq(usuarios.id, empresaUsuarios.usuarioId))
      .where(eq(empresaUsuarios.empresaId, id))
      .orderBy(asc(usuarios.nome)),
    db.select({ modulo: empresaModulos.modulo, ativo: empresaModulos.ativo }).from(empresaModulos).where(eq(empresaModulos.empresaId, id)),
    db
      .select({ id: auditoria.id, acao: auditoria.acao, ator: auditoria.ator, criadoEm: auditoria.criadoEm, quem: usuarios.nome })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
      .where(eq(auditoria.empresaId, id))
      .orderBy(desc(auditoria.criadoEm))
      .limit(20),
  ]);
  return { empresa, membros, modulos: modulosAtivos(empresa.perfil, escolhas), eventos };
}

export async function usuarioPorEmail(db: BancoDeDados, email: string) {
  const [u] = await db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  return u;
}
