import { timingSafeEqual } from "node:crypto";
import { obterDb } from "@/db";
import { MANIPULADORES, agendarRotinasDiarias, processarTarefas } from "@/lib/servidor/tarefas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/**
 * Chamado pela Vercel Cron (vercel.json) com `Authorization: Bearer $CRON_SECRET`.
 * Enfileira as rotinas do dia (idempotente) e processa a fila.
 */
export async function GET(req: Request) {
  if (!autorizado(req)) return new Response("Não autorizado", { status: 401 });
  const db = obterDb();
  const empresas = await agendarRotinasDiarias(db);
  const resultado = await processarTarefas(db, MANIPULADORES, 50);
  return Response.json({ empresas, ...resultado });
}
