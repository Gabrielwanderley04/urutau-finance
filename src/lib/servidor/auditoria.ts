import "server-only";
import type { BancoDeDados } from "@/db";
import { auditoria } from "@/db/schema";

type Ator = (typeof auditoria.$inferInsert)["ator"];

export interface RegistroAuditoria {
  empresaId?: string | null;
  usuarioId?: string | null;
  ator: Ator;
  /** Verbo curto e estável, para filtrar depois: "venda.conferir", "admin.redefinir_senha"… */
  acao: string;
  entidade?: string;
  entidadeId?: string;
  dados?: Record<string, unknown>;
}

/** Nunca guarde senhas, tokens ou conteúdo clínico em `dados`. */
export async function registrarAuditoria(db: BancoDeDados, r: RegistroAuditoria) {
  await db.insert(auditoria).values({
    empresaId: r.empresaId ?? null,
    usuarioId: r.usuarioId ?? null,
    ator: r.ator,
    acao: r.acao,
    entidade: r.entidade ?? null,
    entidadeId: r.entidadeId ?? null,
    dados: r.dados ?? null,
  });
}
