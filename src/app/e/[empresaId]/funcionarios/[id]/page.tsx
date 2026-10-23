import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { ComposicaoCusto } from "@/components/ComposicaoCusto";
import { FormFuncionario } from "@/components/FormFuncionario";
import { obterDb } from "@/db";
import { folhaMensal, funcionarios, pagamentosProvisao } from "@/db/schema";
import { FormProvisao } from "@/components/FormProvisao";
import { avos13, sugerirPagamento } from "@/lib/calculos/provisoes";
import { excluirPagamentoProvisao, registrarPagamentoProvisao } from "@/lib/servidor/acoes-fase4";
import { formatarData, hoje, mesAtual, nomeDoMes } from "@/lib/datas";
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
  const ano = Number(atual.slice(0, 4));
  const avos = avos13(ano, f.admissao, f.desligamento);
  const [todasFolhas, pagamentos] = await Promise.all([
    db.select({ competencia: folhaMensal.competencia, provisao13: folhaMensal.provisao13, provisaoFerias: folhaMensal.provisaoFerias })
      .from(folhaMensal).where(and(eq(folhaMensal.funcionarioId, id), eq(folhaMensal.empresaId, empresaId))),
    db.select().from(pagamentosProvisao).where(and(eq(pagamentosProvisao.funcionarioId, id), eq(pagamentosProvisao.empresaId, empresaId))).orderBy(desc(pagamentosProvisao.pagoEm)),
  ]);
  // Reservas sem FGTS e encargos (que têm a sua própria linha na folha); pagamentos com tudo o que saiu do caixa.
  const reserva13 = todasFolhas.filter((h) => h.competencia.startsWith(String(ano))).reduce((t, h) => t + h.provisao13, 0);
  const pago13 = pagamentos.filter((p) => p.tipo === "decimo_terceiro" && p.pagoEm.startsWith(String(ano))).reduce((t, p) => t + p.valorCentavos, 0);
  const reservaFerias = todasFolhas.reduce((t, h) => t + h.provisaoFerias, 0);
  const pagoFerias = pagamentos.filter((p) => p.tipo === "ferias").reduce((t, p) => t + p.valorCentavos, 0);

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

      <section className="cartao space-y-3">
        <h2 className="font-titulo text-lg font-bold">13º e férias</h2>
        <p className="text-sm text-suave">
          Todo mês o urutau reserva 1/12 do 13º e das férias no custo, então o lucro já considerou esse gasto. Quando pagar, registre aqui: o valor sai do caixa sem pesar no lucro de novo.
        </p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-suave">13º reservado em {ano}</dt>
            <dd className="numero font-bold">{formatarReais(reserva13)}</dd>
            <dd className="text-xs text-suave">pago: {formatarReais(pago13)}</dd>
          </div>
          <div>
            <dt className="text-suave">Férias reservadas</dt>
            <dd className="numero font-bold">{formatarReais(reservaFerias)}</dd>
            <dd className="text-xs text-suave">pago: {formatarReais(pagoFerias)}</dd>
          </div>
        </dl>
        {pagamentos.length > 0 && (
          <ul className="divide-y divide-borda text-sm">
            {pagamentos.map((pg) => (
              <li key={pg.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {pg.tipo === "ferias" ? "Férias" : "13º"} · {formatarData(pg.pagoEm)}
                  {pg.descricao && <span className="block text-xs text-suave">{pg.descricao}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="numero">{formatarReais(pg.valorCentavos)}</span>
                  {gerencia && <BotaoAcao acao={excluirPagamentoProvisao.bind(null, empresaId, pg.id)} className="text-xs text-negativo underline" confirmar="Excluir este pagamento?">excluir</BotaoAcao>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {gerencia && (
          <FormProvisao
            acao={registrarPagamentoProvisao.bind(null, empresaId, id)}
            hoje={hoje()}
            avos={avos}
            sugestoes={{
              decimo_terceiro: sugerirPagamento("decimo_terceiro", f.salarioBrutoCentavos, avos, encargos, aliquotas),
              ferias: sugerirPagamento("ferias", f.salarioBrutoCentavos, 0, encargos, aliquotas),
            }}
          />
        )}
      </section>

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
