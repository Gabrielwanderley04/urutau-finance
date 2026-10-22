import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { participacaoPorFonte } from "@/lib/calculos/painel";
import { formatarData, formatarDataCurta, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais } from "@/lib/dinheiro";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";
import { NOME_FORMA } from "@/lib/rotulos";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { marcarVendaRecebida } from "@/lib/servidor/acoes-lancamentos";
import { listarVendasDoMes } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Vendas" };

export default async function Vendas({
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
  const lista = await listarVendasDoMes(ctx, mes);
  const base = `/e/${empresaId}`;
  const total = lista.reduce((s, v) => s + v.valor, 0);
  const aReceber = lista.filter((v) => v.status === "a_receber").reduce((s, v) => s + v.valor, 0);
  const porFonte = new Map<string, { id: string; nome: string; valor: number }>();
  for (const v of lista) {
    const f = porFonte.get(v.fonteId) ?? { id: v.fonteId, nome: v.fonte, valor: 0 };
    f.valor += v.valor;
    porFonte.set(v.fonteId, f);
  }
  const fontes = participacaoPorFonte([...porFonte.values()]);
  const veTudo = pode(ctx.papel, "ver_todos_lancamentos");

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Vendas</h1>
        {pode(ctx.papel, "lancar") && <Link href={`${base}/vendas/nova`} className="btn-principal !min-h-11">+ Nova venda</Link>}
      </header>
      {sp.salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Venda salva.</p>}
      <SeletorMes mes={mes} base={`${base}/vendas`} mesAtual={atual} />

      <section className="cartao">
        <p className="text-sm text-suave">{veTudo ? "Total vendido" : "Total que você lançou"} em {nomeDoMes(mes)}</p>
        <Valor centavos={total} tamanho="xl" destaque />
        {aReceber > 0 && <p className="mt-1 text-sm text-suave">Ainda a receber: <strong className="text-texto">{formatarReais(aReceber)}</strong></p>}
        {fontes.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {fontes.map((f) => (
              <li key={f.id} className="rounded-full border border-borda px-2.5 py-1">
                {f.nome}: <strong>{formatarReais(f.valor)}</strong> ({formatarPcm(f.participacao, 0)})
              </li>
            ))}
          </ul>
        )}
      </section>

      {lista.length === 0 ? (
        <p className="py-10 text-center text-suave">Nenhuma venda em {nomeDoMes(mes)}.</p>
      ) : (
        <ul className="cartao divide-y divide-borda !p-0">
          {lista.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`${base}/vendas/${v.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{v.descricao || v.fonte}</span>
                <span className="block text-xs text-suave">
                  {formatarData(v.data)} · {v.fonte} · {NOME_FORMA[v.formaPagamento]}
                  {veTudo && v.autor ? ` · ${v.autor.split(" ")[0]}` : ""}
                </span>
                {v.status === "a_receber" && (
                  <span className="mt-1 inline-block rounded-full border border-borda px-2 py-0.5 text-xs">A receber em {formatarDataCurta(v.dataRecebimento)}</span>
                )}
              </Link>
              <div className="flex flex-col items-end gap-1">
                <Valor centavos={v.valor} tamanho="sm" />
                {v.status === "a_receber" && podeAlterarLancamento(ctx.papel, ctx.usuario.id, v.criadoPor) && (
                  <BotaoAcao acao={marcarVendaRecebida.bind(null, empresaId, v.id)} className="text-xs text-suave underline">
                    marcar recebido
                  </BotaoAcao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
