import "server-only";
import { eq } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { empresaParametros, parametrosFiscais } from "@/db/schema";
import type { AliquotasFolha } from "@/lib/calculos/folha";
import { type LinhaParametro, resolverVarios } from "@/lib/calculos/parametros";
import type { Data } from "@/lib/datas";

export interface TabelaParametros {
  globais: LinhaParametro[];
  daEmpresa: LinhaParametro[];
}

export async function carregarParametros(db: BancoDeDados, empresaId: string): Promise<TabelaParametros> {
  const colunas = {
    chave: parametrosFiscais.chave,
    valor: parametrosFiscais.valor,
    vigenciaInicio: parametrosFiscais.vigenciaInicio,
    vigenciaFim: parametrosFiscais.vigenciaFim,
  };
  const [globais, daEmpresa] = await Promise.all([
    db.select(colunas).from(parametrosFiscais),
    db
      .select({
        chave: empresaParametros.chave,
        valor: empresaParametros.valor,
        vigenciaInicio: empresaParametros.vigenciaInicio,
        vigenciaFim: empresaParametros.vigenciaFim,
      })
      .from(empresaParametros)
      .where(eq(empresaParametros.empresaId, empresaId)),
  ]);
  return { globais, daEmpresa };
}

const CHAVES_FOLHA = ["fgts", "inss_patronal", "rat", "terceiros", "mei_cpp"] as const;

export function aliquotasFolha(t: TabelaParametros, data: Data): AliquotasFolha {
  const p = resolverVarios(CHAVES_FOLHA, data, t.globais, t.daEmpresa);
  return { fgts: p.fgts, inssPatronal: p.inss_patronal, rat: p.rat, terceiros: p.terceiros, meiCpp: p.mei_cpp };
}
