import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { dividas, parcelasDivida } from "@/db/schema";
import { saldoDevedorEm } from "@/lib/calculos/dividas";
import { type Data, type Mes, intervaloDoMes } from "@/lib/datas";

export interface ResumoDivida {
  id: string;
  credor: string;
  tipo: (typeof dividas.$inferSelect)["tipo"];
  jurosMensaisPcm: number;
  valorParcela: number;
  saldoDevedor: number;
  /** Saldo + juros das parcelas que faltam: quanto ainda vai sair do caixa. */
  totalAPagar: number;
  parcelasPagas: number;
  parcelasTotal: number;
  proximoVencimento: Data | null;
  terminaEm: Data | null;
  venceNoMes: number;
  atrasadas: number;
}

export async function listarDividas(db: BancoDeDados, empresaId: string, mes: Mes, hojeData: Data): Promise<ResumoDivida[]> {
  const { inicio, fim } = intervaloDoMes(mes);
  const linhas = await db
    .select({ divida: dividas, parcela: parcelasDivida })
    .from(dividas)
    .innerJoin(parcelasDivida, and(eq(parcelasDivida.dividaId, dividas.id), eq(parcelasDivida.empresaId, dividas.empresaId)))
    .where(and(eq(dividas.empresaId, empresaId), isNull(dividas.excluidoEm)))
    .orderBy(asc(dividas.criadoEm), asc(parcelasDivida.numero));

  const porDivida = new Map<string, { divida: typeof dividas.$inferSelect; parcelas: (typeof parcelasDivida.$inferSelect)[] }>();
  for (const l of linhas) {
    const g = porDivida.get(l.divida.id) ?? { divida: l.divida, parcelas: [] };
    g.parcelas.push(l.parcela);
    porDivida.set(l.divida.id, g);
  }

  return [...porDivida.values()].map(({ divida: d, parcelas }) => {
    const abertas = parcelas.filter((p) => p.status === "a_pagar");
    return {
      id: d.id,
      credor: d.credor,
      tipo: d.tipo,
      jurosMensaisPcm: d.jurosMensaisPcm,
      valorParcela: d.valorParcelaCentavos,
      saldoDevedor: saldoDevedorEm(parcelas, fim),
      totalAPagar: abertas.reduce((s, p) => s + p.valor, 0),
      parcelasPagas: parcelas.length - abertas.length,
      parcelasTotal: parcelas.length,
      proximoVencimento: abertas[0]?.vencimento ?? null,
      terminaEm: parcelas.at(-1)?.vencimento ?? null,
      venceNoMes: parcelas.filter((p) => p.vencimento >= inicio && p.vencimento < fim).reduce((s, p) => s + p.valor, 0),
      atrasadas: abertas.filter((p) => p.vencimento < hojeData).length,
    };
  });
}

export async function obterDivida(db: BancoDeDados, empresaId: string, id: string) {
  const [d] = await db
    .select()
    .from(dividas)
    .where(and(eq(dividas.id, id), eq(dividas.empresaId, empresaId), isNull(dividas.excluidoEm)));
  if (!d) return null;
  const parcelas = await db
    .select()
    .from(parcelasDivida)
    .where(and(eq(parcelasDivida.dividaId, id), eq(parcelasDivida.empresaId, empresaId)))
    .orderBy(asc(parcelasDivida.numero));
  return { divida: d, parcelas };
}

/** Parcelas que vencem no mês (para a tela de despesas). */
export async function parcelasDoMes(db: BancoDeDados, empresaId: string, mes: Mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  return db
    .select({ parcela: parcelasDivida, credor: dividas.credor, numParcelas: sql<number>`(select count(*)::int from ${parcelasDivida} p2 where p2.divida_id = ${dividas.id})` })
    .from(parcelasDivida)
    .innerJoin(dividas, and(eq(dividas.id, parcelasDivida.dividaId), eq(dividas.empresaId, parcelasDivida.empresaId)))
    .where(
      and(
        eq(parcelasDivida.empresaId, empresaId),
        isNull(dividas.excluidoEm),
        sql`${parcelasDivida.vencimento} >= ${inicio} and ${parcelasDivida.vencimento} < ${fim}`,
      ),
    )
    .orderBy(asc(parcelasDivida.vencimento));
}
