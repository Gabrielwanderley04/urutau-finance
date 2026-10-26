import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarData } from "@/lib/datas";
import { NOME_FORMA, ROTULO_ORIGEM_VENDA } from "@/lib/rotulos";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { conferir } from "@/lib/servidor/acoes-conferencia";
import { listarParaConferir } from "@/lib/servidor/conferencia";
import { formatarTelefone } from "@/lib/validacao";

export const metadata = { title: "Para conferir" };

export default async function Conferir({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "conferir");
  const lista = await listarParaConferir(obterDb(), empresaId);
  const base = `/e/${empresaId}`;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-titulo text-2xl font-bold">Para conferir</h1>
        <p className="text-sm text-suave">
          Vendas que entraram sozinhas, pelo atendente do WhatsApp, pela agenda ou pelo site. Confira valor e pagamento e dê o check.
        </p>
      </header>
      {lista.length === 0 ? (
        <p className="py-10 text-center text-suave">Tudo conferido. ✓</p>
      ) : (
        <ul className="space-y-3">
          {lista.map((v) => (
            <li key={v.id} className="cartao space-y-3">
              <div className="flex items-start justify-between gap-3">
                <Link href={`${base}/vendas/${v.id}`} className="min-w-0">
                  <span className="block font-medium">{v.descricao || v.fonte}</span>
                  <span className="block text-xs text-suave">
                    {formatarData(v.data)} · {v.fonte} · {NOME_FORMA[v.formaPagamento]}
                  </span>
                </Link>
                <Valor centavos={v.valor} tamanho="sm" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-borda px-2 py-0.5">via {ROTULO_ORIGEM_VENDA[v.origem]}</span>
                <span className={`rounded-full border px-2 py-0.5 ${v.status === "recebido" ? "border-positivo text-positivo" : "border-borda"}`}>
                  {v.status === "recebido" ? "Pagamento confirmado" : "Ainda não pago"}
                </span>
                {v.clienteId && (
                  <Link href={`${base}/clientes/${v.clienteId}`} className="rounded-full border border-borda px-2 py-0.5 underline">
                    {v.cliente}{v.telefone ? ` · ${formatarTelefone(v.telefone)}` : ""}
                  </Link>
                )}
              </div>
              <BotaoAcao acao={conferir.bind(null, empresaId, v.id)} className="btn-principal w-full">
                ✓ Conferido
              </BotaoAcao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
