import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { encargosDoRegime } from "@/lib/calculos/folha";
import { formatarData, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais, razaoPcm } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { pagarFolha } from "@/lib/servidor/acoes-funcionarios";
import { folhaDoMes, sincronizarFolha } from "@/lib/servidor/folha";
import { EXPLICA_ENCARGOS } from "@/lib/textos-folha";

export const metadata = { title: "Funcionários" };

export default async function Funcionarios({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const { empresa, papel } = await exigirAcesso(empresaId, "ver_painel");
  const atual = mesAtual();
  const mes = mesValido(sp.mes) ? sp.mes : atual;
  const db = obterDb();
  await sincronizarFolha(db, empresa, mes, atual);
  const linhas = await folhaDoMes(db, empresaId, mes);
  const base = `/e/${empresaId}`;
  const gerencia = pode(papel, "gerenciar");

  const custo = linhas.reduce((s, l) => s + l.linha.custoTotal, 0);
  const salarios = linhas.reduce((s, l) => s + l.linha.salario, 0);
  const caixa = linhas.reduce((s, l) => s + l.linha.valorCaixa, 0);
  const aPagar = linhas.filter((l) => l.linha.status === "a_pagar");
  const vencimento = linhas[0]?.linha.vencimento;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Funcionários</h1>
        {gerencia && <Link href={`${base}/funcionarios/novo`} className="btn-principal !min-h-11">+ Novo</Link>}
      </header>
      <SeletorMes mes={mes} base={`${base}/funcionarios`} mesAtual={atual} />

      <section className="cartao">
        <p className="text-sm text-suave">Custo da equipe em {nomeDoMes(mes)}</p>
        <Valor centavos={custo} tamanho="xl" destaque />
        {linhas.length > 0 && (
          <p className="mt-1 text-sm text-suave">
            Salários somam {formatarReais(salarios)}. Com encargos, reservas e benefícios, a equipe custa{" "}
            <strong className="text-texto">{formatarPcm(razaoPcm(custo - salarios, salarios) ?? 0, 0)} a mais</strong>.
          </p>
        )}
        {linhas.length > 0 && (
          <div className="mt-3 rounded-xl border border-borda p-3 text-sm">
            <p>
              Pagamento do mês: <strong className="numero">{formatarReais(caixa)}</strong>
              <span className="text-suave"> (salários, FGTS, benefícios{encargosDoRegime(empresa.regime, empresa.anexoServicos) !== "nenhum" ? " e encargos" : ""})</span>
            </p>
            <p className="mt-1 text-xs text-suave">
              A diferença ({formatarReais(custo - caixa)}) é reserva para 13º e férias: conta no lucro todo mês, mas só sai do caixa quando for paga.
            </p>
            {aPagar.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-suave">Vence até {vencimento && formatarData(vencimento)}</span>
                {gerencia && (
                  <BotaoAcao acao={pagarFolha.bind(null, empresaId, mes, undefined)} className="btn-secundario !min-h-10 text-sm">
                    Marcar folha como paga
                  </BotaoAcao>
                )}
              </div>
            ) : (
              <p className="mt-2 text-positivo">✓ Folha paga</p>
            )}
          </div>
        )}
      </section>

      {linhas.length === 0 ? (
        <p className="py-8 text-center text-suave">Nenhum funcionário na folha de {nomeDoMes(mes)}.</p>
      ) : (
        <ul className="cartao divide-y divide-borda !p-0">
          {linhas.map(({ linha: l, nome, cargo }) => (
            <li key={l.id}>
              <Link href={`${base}/funcionarios/${l.funcionarioId}`} className="block px-4 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{nome}</span>
                    <span className="block text-xs text-suave">
                      {cargo || "—"}
                      {l.diasTrabalhados < 30 && ` · ${l.diasTrabalhados} dias no mês`}
                      {l.status === "pago" && " · pago"}
                    </span>
                  </span>
                  <Valor centavos={l.custoTotal} tamanho="sm" />
                </span>
                <span className="mt-1 block text-xs text-suave">
                  Recebe {formatarReais(l.salario)} · custa {formatarReais(l.custoTotal)} para a empresa
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="aviso">{EXPLICA_ENCARGOS[encargosDoRegime(empresa.regime, empresa.anexoServicos)]}</p>
      <p className="text-xs text-suave">
        O custo da folha entra sozinho nas despesas do mês. Não lance salários de novo como despesa: a categoria &quot;Funcionários&quot; é para extras, como rescisão, hora extra avulsa ou freelancer.
      </p>
    </div>
  );
}
