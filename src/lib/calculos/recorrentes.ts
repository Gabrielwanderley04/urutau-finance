import type { Data, Mes } from "@/lib/datas";
import { diaNoMes, somarMeses } from "@/lib/datas";

export interface Recorrencia {
  id: string;
  inicio: Mes;
  fim: Mes | null;
  diaVencimento: number;
  ativo: boolean;
}

/** Meses em que a recorrência gera lançamento, do início até `ateMes` (inclusive). */
export function mesesDaRecorrencia(r: Recorrencia, ateMes: Mes): { mes: Mes; vencimento: Data; referencia: string }[] {
  if (!r.ativo) return [];
  const ultimo = r.fim && r.fim < ateMes ? r.fim : ateMes;
  const lista = [];
  for (let m = r.inicio; m <= ultimo; m = somarMeses(m, 1)) {
    lista.push({ mes: m, vencimento: diaNoMes(m, r.diaVencimento), referencia: `recorrente:${r.id}:${m}` });
  }
  return lista;
}
