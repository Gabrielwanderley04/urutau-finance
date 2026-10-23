import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { obterDb } from "@/db";
import { categoriasDespesa, despesasRecorrentes } from "@/db/schema";
import { nomeDoMes } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { alternarRecorrente } from "@/lib/servidor/acoes-fase4";

export const metadata = { title: "Despesas recorrentes" };

export default async function Recorrentes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo } = await searchParams;
  await exigirAcesso(empresaId, "gerenciar");
  const lista = await obterDb()
    .select({ r: despesasRecorrentes, categoria: categoriasDespesa.nome })
    .from(despesasRecorrentes)
    .innerJoin(categoriasDespesa, and(eq(categoriasDespesa.id, despesasRecorrentes.categoriaId), eq(categoriasDespesa.empresaId, despesasRecorrentes.empresaId)))
    .where(eq(despesasRecorrentes.empresaId, empresaId))
    .orderBy(asc(despesasRecorrentes.diaVencimento));
  const base = `/e/${empresaId}`;
  const total = lista.filter((l) => l.r.ativo).reduce((s, l) => s + l.r.valorCentavos, 0);
  return (
    <div className="space-y-4">
      <Cabecalho titulo="Recorrentes" voltar={`${base}/despesas`} acao={<Link href={`${base}/despesas/recorrentes/nova`} className="btn-principal !min-h-11">+ Nova</Link>} />
      {salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Salvo. As contas dos próximos meses já foram criadas.</p>}
      <p className="text-sm text-suave">
        Despesas que se repetem todo mês. Cadastre uma vez e o urutau cria a conta a pagar de cada mês. Hoje somam <strong className="text-texto">{formatarReais(total)}</strong> por mês.
      </p>
      {lista.length === 0 ? (
        <p className="py-8 text-center text-suave">Nenhuma despesa recorrente. Comece pelo aluguel. 🙂</p>
      ) : (
        <ul className="cartao divide-y divide-borda !p-0">
          {lista.map(({ r, categoria }) => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.ativo ? "" : "opacity-60"}`}>
              <Link href={`${base}/despesas/recorrentes/${r.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.descricao}</span>
                <span className="block text-xs text-suave">
                  Todo dia {r.diaVencimento} · {categoria} · desde {nomeDoMes(r.inicio, true)}
                  {r.fim && ` até ${nomeDoMes(r.fim, true)}`}
                  {!r.ativo && " · pausada"}
                </span>
              </Link>
              <div className="flex flex-col items-end gap-1">
                <span className="numero font-bold">{formatarReais(r.valorCentavos)}</span>
                <BotaoAcao acao={alternarRecorrente.bind(null, empresaId, r.id, !r.ativo)} className="text-xs text-suave underline"
                  confirmar={r.ativo ? "Pausar? As contas futuras ainda não pagas serão removidas." : undefined}>
                  {r.ativo ? "pausar" : "retomar"}
                </BotaoAcao>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
