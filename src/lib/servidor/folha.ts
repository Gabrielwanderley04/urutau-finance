import "server-only";
import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { BancoDeDados } from "@/db";
import { type Empresa, folhaMensal, funcionarios } from "@/db/schema";
import {
  type Beneficios,
  beneficiosProporcionais,
  calcularCustoFuncionario,
  diasTrabalhados,
  encargosDoRegime,
  salarioProporcional,
} from "@/lib/calculos/folha";
import { type Mes, mesDe, somarMeses } from "@/lib/datas";
import { aliquotasFolha, carregarParametros } from "./parametros";

type Funcionario = typeof funcionarios.$inferSelect;

export function beneficiosDe(f: Funcionario): Beneficios {
  return {
    valeTransporte: f.vtCentavos,
    valeRefeicao: f.vrCentavos,
    planoSaude: f.planoSaudeCentavos,
    outros: f.outrosBeneficiosCentavos,
  };
}

/** Linha da folha de um funcionário em um mês (null se não trabalhou). */
export function calcularLinhaFolha(
  f: Funcionario,
  empresa: Pick<Empresa, "regime" | "anexoServicos">,
  mes: Mes,
  aliquotas: ReturnType<typeof aliquotasFolha>,
) {
  const dias = diasTrabalhados(mes, f.admissao, f.desligamento);
  if (dias === 0) return null;
  const c = calcularCustoFuncionario(
    salarioProporcional(f.salarioBrutoCentavos, dias),
    beneficiosProporcionais(beneficiosDe(f), dias),
    encargosDoRegime(empresa.regime, empresa.anexoServicos),
    aliquotas,
  );
  return {
    empresaId: f.empresaId,
    funcionarioId: f.id,
    competencia: mes,
    diasTrabalhados: dias,
    salario: c.salario,
    fgts: c.fgts,
    provisao13: c.provisao13,
    provisaoFerias: c.provisaoFerias,
    fgtsProvisoes: c.fgtsProvisoes,
    inssPatronal: c.inssPatronal,
    rat: c.rat,
    terceiros: c.terceiros,
    beneficios: c.beneficios,
    custoTotal: c.total,
    valorCaixa: c.caixa,
    // Salário é pago até o 5º dia útil do mês seguinte; usamos o dia 5 como referência.
    vencimento: `${somarMeses(mes, 1)}-05`,
  };
}

/**
 * Gera a folha mensal de cada funcionário, de `folha_desde` até `ateMes` (no máximo o mês atual).
 * - Meses anteriores ao atual ficam congelados depois de gerados (o passado não muda).
 * - O mês atual, enquanto não pago, é recalculado (ex.: aumento de salário).
 * Idempotente: pode ser chamada a cada carregamento de tela.
 */
export async function sincronizarFolha(db: BancoDeDados, empresa: Empresa, ateMes: Mes, mesAtual: Mes) {
  const limite = ateMes < mesAtual ? ateMes : mesAtual;
  const lista = await db
    .select()
    .from(funcionarios)
    .where(and(eq(funcionarios.empresaId, empresa.id), isNull(funcionarios.excluidoEm)));
  if (lista.length === 0) return;

  const existentes = await db
    .select({ funcionarioId: folhaMensal.funcionarioId, competencia: folhaMensal.competencia, status: folhaMensal.status, custoTotal: folhaMensal.custoTotal, valorCaixa: folhaMensal.valorCaixa, diasTrabalhados: folhaMensal.diasTrabalhados })
    .from(folhaMensal)
    .where(eq(folhaMensal.empresaId, empresa.id));
  const porChave = new Map(existentes.map((e) => [`${e.funcionarioId}|${e.competencia}`, e]));

  const tabela = await carregarParametros(db, empresa.id);
  const inserir: NonNullable<ReturnType<typeof calcularLinhaFolha>>[] = [];
  const atualizar: NonNullable<ReturnType<typeof calcularLinhaFolha>>[] = [];

  for (const f of lista) {
    let mes = f.folhaDesde > mesDe(f.admissao) ? f.folhaDesde : mesDe(f.admissao);
    const ultimo = f.desligamento && mesDe(f.desligamento) < limite ? mesDe(f.desligamento) : limite;
    for (; mes <= ultimo; mes = somarMeses(mes, 1)) {
      const atual = porChave.get(`${f.id}|${mes}`);
      if (atual && (mes < mesAtual || atual.status === "pago")) continue;
      const linha = calcularLinhaFolha(f, empresa, mes, aliquotasFolha(tabela, `${mes}-01`));
      if (!linha) continue;
      if (!atual) inserir.push(linha);
      else if (atual.custoTotal !== linha.custoTotal || atual.valorCaixa !== linha.valorCaixa || atual.diasTrabalhados !== linha.diasTrabalhados)
        atualizar.push(linha);
    }
  }

  if (inserir.length) await db.insert(folhaMensal).values(inserir).onConflictDoNothing();
  for (const l of atualizar) {
    await db
      .update(folhaMensal)
      .set(l)
      .where(
        and(
          eq(folhaMensal.empresaId, l.empresaId),
          eq(folhaMensal.funcionarioId, l.funcionarioId),
          eq(folhaMensal.competencia, l.competencia),
          eq(folhaMensal.status, "a_pagar"),
        ),
      );
  }
}

/**
 * Depois de editar ou excluir um funcionário: apaga as linhas não pagas do mês aberto
 * e as que ficaram fora do novo período. A próxima sincronização recria o necessário.
 */
export async function limparFolhaAberta(db: BancoDeDados, empresaId: string, funcionarioId: string, mesAtual: Mes, excluido = false) {
  const [f] = await db.select().from(funcionarios).where(and(eq(funcionarios.id, funcionarioId), eq(funcionarios.empresaId, empresaId)));
  if (!f) return;
  const inicio = f.folhaDesde > mesDe(f.admissao) ? f.folhaDesde : mesDe(f.admissao);
  await db
    .delete(folhaMensal)
    .where(
      and(
        eq(folhaMensal.empresaId, empresaId),
        eq(folhaMensal.funcionarioId, funcionarioId),
        eq(folhaMensal.status, "a_pagar"),
        excluido
          ? undefined
          : or(
              eq(folhaMensal.competencia, mesAtual),
              lt(folhaMensal.competencia, inicio),
              f.desligamento ? gt(folhaMensal.competencia, mesDe(f.desligamento)) : undefined,
            ),
      ),
    );
}

export async function folhaDoMes(db: BancoDeDados, empresaId: string, mes: Mes) {
  return db
    .select({ linha: folhaMensal, nome: funcionarios.nome, cargo: funcionarios.cargo })
    .from(folhaMensal)
    .innerJoin(funcionarios, and(eq(funcionarios.id, folhaMensal.funcionarioId), eq(funcionarios.empresaId, folhaMensal.empresaId)))
    .where(and(eq(folhaMensal.empresaId, empresaId), eq(folhaMensal.competencia, mes)))
    .orderBy(asc(funcionarios.nome));
}

/** Alíquotas vigentes e tipo de encargo da empresa (para a prévia do formulário). */
export async function contextoFolha(db: BancoDeDados, empresa: Empresa, data: string) {
  const tabela = await carregarParametros(db, empresa.id);
  return { aliquotas: aliquotasFolha(tabela, data), encargos: encargosDoRegime(empresa.regime, empresa.anexoServicos) };
}
