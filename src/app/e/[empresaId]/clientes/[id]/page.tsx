import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormCliente } from "@/components/FormCliente";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarData } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { ROTULO_ORIGEM_VENDA } from "@/lib/rotulos";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { excluirCliente, salvarCliente } from "@/lib/servidor/acoes-clientes";
import { comprasDoCliente, obterCliente } from "@/lib/servidor/clientes";
import { formatarTelefone } from "@/lib/validacao";

export const metadata = { title: "Cliente" };

export default async function Cliente({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId, id } = await params;
  const { salvo } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const db = obterDb();
  const cliente = /^[0-9a-f-]{36}$/i.test(id) ? await obterCliente(db, empresaId, id) : undefined;
  if (!cliente) notFound();
  // Compras ficam com quem vê todos os lançamentos (o colaborador vê só o que lançou, na tela de vendas).
  const compras = pode(ctx.papel, "ver_todos_lancamentos") ? await comprasDoCliente(db, empresaId, id) : [];
  const total = compras.reduce((s, c) => s + c.valor, 0);
  const base = `/e/${empresaId}`;
  return (
    <>
      <Cabecalho titulo={cliente.nome} voltar={`${base}/clientes`} />
      {salvo && <p role="status" className="mb-4 rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Cliente salvo.</p>}
      {cliente.telefone && (
        <a href={`https://wa.me/${cliente.telefone}`} target="_blank" rel="noreferrer" className="btn-secundario mb-5 w-full">
          Abrir conversa no WhatsApp · {formatarTelefone(cliente.telefone)}
        </a>
      )}

      {compras.length > 0 && (
        <section className="cartao mb-6 !p-0">
          <div className="flex items-baseline justify-between px-4 pt-4">
            <h2 className="font-titulo text-lg font-bold">Compras</h2>
            <Valor centavos={total} tamanho="sm" />
          </div>
          <ul className="mt-2 divide-y divide-borda">
            {compras.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/vendas/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.descricao || c.fonte}</span>
                    <span className="text-xs text-suave">{formatarData(c.data)} · {ROTULO_ORIGEM_VENDA[c.origem]}</span>
                  </span>
                  <Valor centavos={c.valor} tamanho="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FormCliente
        acao={salvarCliente.bind(null, empresaId, id)}
        somenteLeitura={!pode(ctx.papel, "lancar")}
        inicial={{
          nome: cliente.nome,
          telefone: formatarTelefone(cliente.telefone),
          email: cliente.email ?? "",
          documento: cliente.documento ?? "",
          observacao: cliente.observacao,
        }}
      />
      {pode(ctx.papel, "gerenciar") && (
        <div className="mt-6">
          <BotaoAcao acao={excluirCliente.bind(null, empresaId, id)} className="btn-perigo w-full" confirmar="Excluir este cliente? As vendas dele continuam no sistema.">
            Excluir cliente
          </BotaoAcao>
        </div>
      )}
    </>
  );
}
