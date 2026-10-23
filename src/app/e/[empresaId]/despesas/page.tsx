import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { obterDb } from "@/db";
import { pagarParcela } from "@/lib/servidor/acoes-dividas";
import { pagarFolha } from "@/lib/servidor/acoes-funcionarios";
import { marcarDespesaPaga } from "@/lib/servidor/acoes-lancamentos";
import { parcelasDoMes } from "@/lib/servidor/dividas";
import { folhaDoMes } from "@/lib/servidor/folha";
import { listarDespesasDoMes } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Despesas" };

export default async function Despesas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string; salvo?: string }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const atual = mesAtual();
  const mes = mesValido(sp.mes) ? sp.mes : atual;
  const lista = await listarDespesasDoMes(ctx, mes);
  const base = `/e/${empresaId}`;
  // Folha e dívidas têm salários e contratos: só para quem vê os números da empresa.
  const veNumeros = pode(ctx.papel, "ver_painel");
  const gerencia = pode(ctx.papel, "gerenciar");
  const db = obterDb();
  await prepararEmpresa(db, ctx.empresa, mes, atual);
  const [folha, parcelas] = veNumeros ? await Promise.all([folhaDoMes(db, empresaId, mes), parcelasDoMes(db, empresaId, mes)]) : [[], []];
  const custoFolha = folha.reduce((s, f) => s + f.linha.custoTotal, 0);
  const folhaAPagar = folha.some((f) => f.linha.status === "a_pagar");
  const jurosMes = parcelas.reduce((s, p) => s + p.parcela.juros, 0);
  const hojeData = hoje();

  const grupos = new Map<string, { nome: string; entraNoLucro: boolean; total: number; itens: typeof lista }>();
  for (const d of lista) {
    const g = grupos.get(d.categoriaId) ?? { nome: d.categoria, entraNoLucro: d.entraNoLucro, total: 0, itens: [] };
    g.total += d.valor;
    g.itens.push(d);
    grupos.set(d.categoriaId, g);
  }
  const totalLucro = lista.filter((d) => d.entraNoLucro).reduce((s, d) => s + d.valor, 0);
  const totalSoCaixa = lista.filter((d) => !d.entraNoLucro).reduce((s, d) => s + d.valor, 0);
  const aPagar =
    lista.filter((d) => d.status === "a_pagar").reduce((s, d) => s + d.valor, 0) +
    parcelas.filter((p) => p.parcela.status === "a_pagar").reduce((s, p) => s + p.parcela.valor, 0) +
    folha.filter((f) => f.linha.status === "a_pagar").reduce((s, f) => s + f.linha.valorCaixa, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Despesas</h1>
        <div className="flex items-center gap-2">
          {gerencia && <Link href={`${base}/despesas/recorrentes`} className="btn-secundario !min-h-11 !px-3 text-sm">↻ Recorrentes</Link>}
          {pode(ctx.papel, "lancar") && <Link href={`${base}/despesas/nova`} className="btn-principal !min-h-11">+ Nova</Link>}
        </div>
      </header>
      {sp.salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Despesa salva.</p>}
      <SeletorMes mes={mes} base={`${base}/despesas`} mesAtual={atual} />

      <section className="cartao">
        <p className="text-sm text-suave">Despesas de {nomeDoMes(mes)}</p>
        <Valor centavos={totalLucro + custoFolha + jurosMes} tamanho="xl" destaque />
        {(custoFolha > 0 || jurosMes > 0) && (
          <p className="mt-1 text-xs text-suave">
            Lançadas {formatarReais(totalLucro)}
            {custoFolha > 0 && ` · folha ${formatarReais(custoFolha)}`}
            {jurosMes > 0 && ` · juros de dívidas ${formatarReais(jurosMes)}`}
          </p>
        )}
        {aPagar > 0 && <p className="mt-1 text-sm text-suave">Ainda a pagar: <strong className="text-texto">{formatarReais(aPagar)}</strong></p>}
        {totalSoCaixa > 0 && (
          <p className="mt-1 text-xs text-suave">+ {formatarReais(totalSoCaixa)} em guias de impostos (contam só no caixa)</p>
        )}
      </section>

      {folha.length > 0 && (
        <section className="cartao !p-0">
          <h2 className="flex items-center justify-between border-b border-borda px-4 py-2.5">
            <Link href={`${base}/funcionarios?mes=${mes}`} className="font-titulo font-bold underline-offset-2 hover:underline">Folha de pagamento ›</Link>
            <span className="numero font-bold">{formatarReais(custoFolha)}</span>
          </h2>
          <ul className="divide-y divide-borda">
            {folha.map(({ linha: f, nome }) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`${base}/funcionarios/${f.funcionarioId}`} className="min-w-0">
                  <span className="block truncate">{nome}</span>
                  <span className="text-xs text-suave">Salário {formatarReais(f.salario)} · {f.status === "pago" ? "pago" : `pagar até ${formatarDataCurta(f.vencimento)}`}</span>
                </Link>
                <Valor centavos={f.custoTotal} tamanho="sm" />
              </li>
            ))}
          </ul>
          {folhaAPagar && gerencia && (
            <div className="border-t border-borda px-4 py-2.5">
              <BotaoAcao acao={pagarFolha.bind(null, empresaId, mes, undefined)} className="text-sm underline">Marcar folha do mês como paga</BotaoAcao>
            </div>
          )}
        </section>
      )}

      {parcelas.length > 0 && (
        <section className="cartao !p-0">
          <h2 className="flex items-center justify-between border-b border-borda px-4 py-2.5">
            <Link href={`${base}/dividas`} className="font-titulo font-bold">Parcelas de dívidas ›</Link>
            <span className="numero font-bold">{formatarReais(jurosMes)} <span className="text-xs font-normal text-suave">de juros</span></span>
          </h2>
          <ul className="divide-y divide-borda">
            {parcelas.map(({ parcela: p, credor, numParcelas }) => {
              const atrasada = p.status === "a_pagar" && p.vencimento < hojeData;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link href={`${base}/dividas/${p.dividaId}`} className="min-w-0">
                    <span className="block truncate">{credor} · {p.numero}/{numParcelas}</span>
                    <span className={`text-xs ${atrasada ? "font-bold text-negativo" : "text-suave"}`}>
                      Parcela {formatarReais(p.valor)}: juros {formatarReais(p.juros)} + abate {formatarReais(p.amortizacao)}
                      {" · "}{p.status === "pago" ? "pago" : atrasada ? `▼ atrasada desde ${formatarDataCurta(p.vencimento)}` : `vence ${formatarDataCurta(p.vencimento)}`}
                    </span>
                  </Link>
                  <div className="flex flex-col items-end gap-1">
                    <Valor centavos={p.juros} tamanho="sm" />
                    {p.status === "a_pagar" && gerencia && (
                      <BotaoAcao acao={pagarParcela.bind(null, empresaId, p.id)} className="text-xs text-suave underline">marcar pago</BotaoAcao>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {lista.length === 0 ? (
        <p className="py-10 text-center text-suave">Nenhuma despesa lançada em {nomeDoMes(mes)}.</p>
      ) : (
        [...grupos.entries()].map(([id, g]) => (
          <section key={id} className="cartao !p-0">
            <h2 className="flex items-center justify-between border-b border-borda px-4 py-2.5">
              <span className="font-titulo font-bold">{g.nome}</span>
              <span className="numero font-bold">{formatarReais(g.total)}</span>
            </h2>
            <ul className="divide-y divide-borda">
              {g.itens.map((d) => {
                const atrasada = d.status === "a_pagar" && d.vencimento < hojeData;
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`${base}/despesas/${d.id}`} className="min-w-0 flex-1">
                      <span className="block truncate">
                        {d.descricao || g.nome}
                        {d.origem !== "manual" && (
                          <span className="ml-1.5 rounded-full border border-borda px-1.5 text-[10px] text-suave">{d.origem === "recorrente" ? "↻ todo mês" : "guia"}</span>
                        )}
                      </span>
                      <span className={`block text-xs ${atrasada ? "font-bold text-negativo" : "text-suave"}`}>
                        {d.status === "pago"
                          ? `Pago em ${formatarDataCurta(d.pagoEm!)}`
                          : atrasada
                            ? `▼ Atrasada: venceu em ${formatarDataCurta(d.vencimento)}`
                            : `A pagar até ${formatarDataCurta(d.vencimento)}`}
                      </span>
                    </Link>
                    <div className="flex flex-col items-end gap-1">
                      <Valor centavos={d.valor} tamanho="sm" />
                      {d.status === "a_pagar" && podeAlterarLancamento(ctx.papel, ctx.usuario.id, d.criadoPor) && (
                        <BotaoAcao acao={marcarDespesaPaga.bind(null, empresaId, d.id)} className="text-xs text-suave underline">
                          marcar pago
                        </BotaoAcao>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
