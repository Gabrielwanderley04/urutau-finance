import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { marcarDespesaPaga } from "@/lib/servidor/acoes-lancamentos";
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
  const aPagar = lista.filter((d) => d.status === "a_pagar").reduce((s, d) => s + d.valor, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Despesas</h1>
        {pode(ctx.papel, "lancar") && <Link href={`${base}/despesas/nova`} className="btn-principal !min-h-11">+ Nova despesa</Link>}
      </header>
      {sp.salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Despesa salva.</p>}
      <SeletorMes mes={mes} base={`${base}/despesas`} mesAtual={atual} />

      <section className="cartao">
        <p className="text-sm text-suave">Despesas de {nomeDoMes(mes)}</p>
        <Valor centavos={totalLucro} tamanho="xl" destaque />
        {aPagar > 0 && <p className="mt-1 text-sm text-suave">Ainda a pagar: <strong className="text-texto">{formatarReais(aPagar)}</strong></p>}
        {totalSoCaixa > 0 && (
          <p className="mt-1 text-xs text-suave">+ {formatarReais(totalSoCaixa)} em guias de impostos (contam só no caixa)</p>
        )}
      </section>

      {lista.length === 0 ? (
        <p className="py-10 text-center text-suave">Nenhuma despesa em {nomeDoMes(mes)}.</p>
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
                      <span className="block truncate">{d.descricao || g.nome}</span>
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
