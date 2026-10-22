import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { ComposicaoCusto } from "@/components/ComposicaoCusto";
import { FormFuncionario } from "@/components/FormFuncionario";
import { obterDb } from "@/db";
import { folhaMensal, funcionarios } from "@/db/schema";
import { hoje, mesAtual, nomeDoMes } from "@/lib/datas";
import { centavosParaInput, formatarReais } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { desfazerPagamentoFolha, excluirFuncionario, pagarFolha, salvarFuncionario } from "@/lib/servidor/acoes-funcionarios";
import { contextoFolha, sincronizarFolha } from "@/lib/servidor/folha";

export const metadata = { title: "Funcionário" };

export default async function Funcionario({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId, id } = await params;
  const { salvo } = await searchParams;
  const { empresa, papel } = await exigirAcesso(empresaId, "ver_painel");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = obterDb();
  const [f] = await db
    .select()
    .from(funcionarios)
    .where(and(eq(funcionarios.id, id), eq(funcionarios.empresaId, empresaId), isNull(funcionarios.excluidoEm)));
  if (!f) notFound();
  const atual = mesAtual();
  await sincronizarFolha(db, empresa, atual, atual);
  const historico = await db
    .select()
    .from(folhaMensal)
    .where(and(eq(folhaMensal.funcionarioId, id), eq(folhaMensal.empresaId, empresaId)))
    .orderBy(desc(folhaMensal.competencia))
    .limit(12);
  const { aliquotas, encargos } = await contextoFolha(db, empresa, hoje());
  const gerencia = pode(papel, "gerenciar");
  const ultima = historico[0];

  return (
    <div className="space-y-5">
      <Cabecalho titulo={f.nome} voltar={`/e/${empresaId}/funcionarios`} />
      {salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Funcionário salvo.</p>}

      {ultima && (
        <ComposicaoCusto
          titulo={`Custo em ${nomeDoMes(ultima.competencia)}${ultima.diasTrabalhados < 30 ? ` (${ultima.diasTrabalhados} dias)` : ""}`}
          c={{ ...ultima, total: ultima.custoTotal }}
        />
      )}

      {historico.length > 0 && (
        <section className="cartao">
          <h2 className="mb-2 font-titulo text-lg font-bold">Folha mês a mês</h2>
          <ul className="divide-y divide-borda text-sm">
            {historico.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="first-letter:uppercase">{nomeDoMes(h.competencia)}</span>
                <span className="flex items-center gap-3">
                  <span className="numero">{formatarReais(h.custoTotal)}</span>
                  {h.status === "pago" ? (
                    gerencia ? (
                      <BotaoAcao acao={desfazerPagamentoFolha.bind(null, empresaId, h.competencia, id)} className="text-xs text-positivo underline" confirmar="Desfazer o pagamento?">
                        ✓ pago
                      </BotaoAcao>
                    ) : <span className="text-xs text-positivo">✓ pago</span>
                  ) : gerencia ? (
                    <BotaoAcao acao={pagarFolha.bind(null, empresaId, h.competencia, id)} className="text-xs text-suave underline">marcar pago</BotaoAcao>
                  ) : <span className="text-xs text-suave">a pagar</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-titulo text-lg font-bold">{gerencia ? "Editar dados" : "Dados"}</h2>
        {gerencia && <p className="mb-3 text-xs text-suave">Mudanças de salário valem a partir do mês atual. Meses anteriores ficam como estavam.</p>}
        <FormFuncionario
          acao={salvarFuncionario.bind(null, empresaId, id)}
          aliquotas={aliquotas}
          encargos={encargos}
          somenteLeitura={!gerencia}
          inicial={{
            nome: f.nome,
            cargo: f.cargo,
            salario: centavosParaInput(f.salarioBrutoCentavos),
            admissao: f.admissao,
            desligamento: f.desligamento ?? "",
            vt: f.vtCentavos ? centavosParaInput(f.vtCentavos) : "",
            vr: f.vrCentavos ? centavosParaInput(f.vrCentavos) : "",
            planoSaude: f.planoSaudeCentavos ? centavosParaInput(f.planoSaudeCentavos) : "",
            outros: f.outrosBeneficiosCentavos ? centavosParaInput(f.outrosBeneficiosCentavos) : "",
            folhaDesde: f.folhaDesde,
          }}
        />
      </section>
      {gerencia && (
        <BotaoAcao acao={excluirFuncionario.bind(null, empresaId, id)} className="btn-perigo w-full"
          confirmar={`Excluir ${f.nome}? Se a pessoa saiu da empresa, prefira informar a data de desligamento.`}>
          Excluir funcionário
        </BotaoAcao>
      )}
    </div>
  );
}
