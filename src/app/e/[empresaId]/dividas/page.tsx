import Link from "next/link";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarData, hoje, mesAtual, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { listarDividas } from "@/lib/servidor/dividas";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";

export const metadata = { title: "Dívidas" };

export default async function Dividas({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { papel } = await exigirAcesso(empresaId, "ver_painel");
  const mes = mesAtual();
  const hojeData = hoje();
  const lista = await listarDividas(obterDb(), empresaId, mes, hojeData);
  const ativas = lista.filter((d) => d.totalAPagar > 0);
  const quitadas = lista.filter((d) => d.totalAPagar === 0);
  const base = `/e/${empresaId}`;
  const saldo = ativas.reduce((s, d) => s + d.saldoDevedor, 0);
  const comJuros = ativas.reduce((s, d) => s + d.totalAPagar, 0);
  const venceNoMes = ativas.reduce((s, d) => s + d.venceNoMes, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Dívidas</h1>
        {pode(papel, "gerenciar") && <Link href={`${base}/dividas/nova`} className="btn-principal !min-h-11">+ Nova</Link>}
      </header>

      <section className="cartao">
        <p className="text-sm text-suave">Total devido hoje</p>
        <Valor centavos={saldo} tamanho="xl" destaque />
        <p className="mt-1 text-sm text-suave">
          Somando os juros que ainda vão vencer, faltam pagar <strong className="text-texto">{formatarReais(comJuros)}</strong>.
        </p>
        <p className="mt-1 text-sm text-suave">
          Vence em {nomeDoMes(mes)}: <strong className="text-texto">{formatarReais(venceNoMes)}</strong>
        </p>
      </section>

      <p className="aviso">
        Em cada parcela, só os <strong>juros</strong> são despesa e diminuem o lucro. A parte que abate a dívida (amortização) sai do caixa, mas não é despesa: é dinheiro que você já tinha recebido emprestado.
      </p>

      {ativas.length === 0 && <p className="py-8 text-center text-suave">Nenhuma dívida em aberto. 🎉</p>}
      <ul className="space-y-3">
        {ativas.map((d) => (
          <li key={d.id}>
            <Link href={`${base}/dividas/${d.id}`} className="cartao block active:scale-[.99]">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-titulo text-lg font-bold">{d.credor}</span>
                  <span className="text-xs text-suave">
                    {NOME_TIPO_DIVIDA[d.tipo]} · {d.jurosMensaisPcm ? `${formatarPcm(d.jurosMensaisPcm)} ao mês` : "sem juros"}
                  </span>
                </span>
                <Valor centavos={d.saldoDevedor} tamanho="md" />
              </span>
              <span className="mt-3 block h-2 rounded-full bg-superficie-2">
                <span className="block h-2 rounded-full bg-[var(--serie-lucro)]" style={{ width: `${(d.parcelasPagas / d.parcelasTotal) * 100}%` }} />
              </span>
              <span className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-suave">
                <span>{d.parcelasPagas} de {d.parcelasTotal} parcelas pagas</span>
                <span>Termina em {d.terminaEm && formatarData(d.terminaEm)}</span>
              </span>
              {d.atrasadas > 0 ? (
                <span className="mt-1 block text-sm font-bold text-negativo">▼ {d.atrasadas} parcela{d.atrasadas > 1 ? "s" : ""} atrasada{d.atrasadas > 1 ? "s" : ""}</span>
              ) : d.proximoVencimento ? (
                <span className="mt-1 block text-sm">Próxima: {formatarReais(d.valorParcela)} em {formatarData(d.proximoVencimento)}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {quitadas.length > 0 && (
        <section>
          <h2 className="mb-2 font-titulo font-bold text-suave">Quitadas</h2>
          <ul className="cartao divide-y divide-borda !p-0">
            {quitadas.map((d) => (
              <li key={d.id}>
                <Link href={`${base}/dividas/${d.id}`} className="flex justify-between px-4 py-3 text-sm">
                  <span>{d.credor}</span>
                  <span className="text-positivo">✓ quitada em {d.terminaEm && formatarData(d.terminaEm)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
