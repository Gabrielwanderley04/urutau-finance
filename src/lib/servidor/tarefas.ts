import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { empresas, tarefas } from "@/db/schema";
import { hoje, mesAtual } from "@/lib/datas";
import { prepararEmpresa } from "./automaticos";

/**
 * Fila de tarefas no próprio Postgres: sem serviço extra para contratar.
 * O cron chama `processarTarefas`; cada tarefa é pega por um só processador (FOR UPDATE SKIP LOCKED),
 * e as que falham voltam para a fila com espera crescente até MAX_TENTATIVAS.
 */

export const MAX_TENTATIVAS = 5;

export type Manipulador = (db: BancoDeDados, tarefa: typeof tarefas.$inferSelect) => Promise<void>;

export interface NovaTarefa {
  tipo: string;
  empresaId?: string | null;
  dados?: Record<string, unknown>;
  /** Mesma chave = mesma tarefa: enfileirar de novo não duplica. */
  chave?: string;
  executarEm?: Date;
}

export async function enfileirar(db: BancoDeDados, t: NovaTarefa) {
  await db
    .insert(tarefas)
    .values({ tipo: t.tipo, empresaId: t.empresaId ?? null, dados: t.dados ?? {}, chave: t.chave ?? null, executarEm: t.executarEm ?? new Date() })
    .onConflictDoNothing({ target: tarefas.chave });
}

/** Espera antes da próxima tentativa: 1, 4, 9, 16 minutos. */
export const esperaAposFalha = (tentativas: number) => tentativas * tentativas * 60_000;

export async function processarTarefas(db: BancoDeDados, manipuladores: Record<string, Manipulador>, limite = 20) {
  // Tarefa presa em "executando" há mais de 10 minutos: o processo caiu no meio. Volta para a fila.
  await db
    .update(tarefas)
    .set({ status: "pendente" })
    .where(and(eq(tarefas.status, "executando"), lt(tarefas.atualizadoEm, new Date(Date.now() - 10 * 60_000))));

  const pegas = await db.transaction(async (tx) => {
    const linhas = await tx.execute<{ id: string }>(sql`
      select id from ${tarefas}
      where status = 'pendente' and executar_em <= now()
      order by executar_em
      limit ${limite}
      for update skip locked`);
    const ids = [...linhas].map((l) => l.id);
    if (!ids.length) return [];
    return tx
      .update(tarefas)
      .set({ status: "executando", tentativas: sql`${tarefas.tentativas} + 1` })
      .where(inArray(tarefas.id, ids))
      .returning();
  });

  const resultado = { concluidas: 0, falhas: 0 };
  for (const t of pegas) {
    try {
      const fazer = manipuladores[t.tipo];
      if (!fazer) throw new Error(`Tipo de tarefa desconhecido: ${t.tipo}`);
      await fazer(db, t);
      await db.update(tarefas).set({ status: "concluida", ultimoErro: null }).where(eq(tarefas.id, t.id));
      resultado.concluidas++;
    } catch (e) {
      const desistir = t.tentativas >= MAX_TENTATIVAS;
      await db
        .update(tarefas)
        .set({
          status: desistir ? "falhou" : "pendente",
          ultimoErro: e instanceof Error ? e.message.slice(0, 1000) : String(e),
          executarEm: new Date(Date.now() + esperaAposFalha(t.tentativas)),
        })
        .where(eq(tarefas.id, t.id));
      resultado.falhas++;
    }
  }
  return resultado;
}

// ─── Rotinas ─────────────────────────────────────────────────────────────────

/**
 * Uma vez por dia, para cada empresa: folha, recorrentes e guias de impostos
 * (o que antes só acontecia quando alguém abria o painel).
 */
export async function agendarRotinasDiarias(db: BancoDeDados, dia = hoje()) {
  const lista = await db.select({ id: empresas.id }).from(empresas);
  for (const e of lista) await enfileirar(db, { tipo: "rotina_diaria", empresaId: e.id, chave: `rotina_diaria:${e.id}:${dia}` });
  return lista.length;
}

export const MANIPULADORES: Record<string, Manipulador> = {
  rotina_diaria: async (db, t) => {
    if (!t.empresaId) throw new Error("rotina_diaria sem empresa");
    const [empresa] = await db.select().from(empresas).where(eq(empresas.id, t.empresaId));
    if (!empresa) return; // empresa excluída depois de enfileirar
    await prepararEmpresa(db, empresa, mesAtual());
  },
};
