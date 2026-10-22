import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormDescricaoDivida } from "@/components/FormDescricaoDivida";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { saldoDevedorEm } from "@/lib/calculos/dividas";
import { formatarData, formatarDataCurta, hoje } from "@/lib/datas";
import { formatarPcm, formatarReais } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { atualizarDescricaoDivida, desfazerPagamentoParcela, excluirDivida, pagarAtrasadas, pagarParcela } from "@/lib/servidor/acoes-dividas";
import { obterDivida } from "@/lib/servidor/dividas";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";

export const metadata = { title: "Dívida" };

export default async function Divida({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId, id } = await params;
  const { salvo } = await searchParams;
  const { papel } = await exigirAcesso(empresaId, "ver_painel");
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await obterDivida(obterDb(), empresaId, id) : null;
  if (!r) notFound();
  const { divida: d, parcelas } = r;
  const hojeData = hoje();
  const gerencia = pode(papel, "gerenciar");
  const saldo = saldoDevedorEm(parcelas, hojeData);
  const abertas = parcelas.filter((p) => p.status === "a_pagar");
  const jurosPagos = parcelas.filter((p) => p.status === "pago").reduce((s, p) => s + p.juros, 0);
  const jurosAPagar = abertas.reduce((s, p) => s + p.juros, 0);
  const atrasadas = abertas.filter((p) => p.vencimento < hojeData).length;

  return (
    <div className="space-y-5">
      <Cabecalho titulo={d.credor} voltar={`/e/${empresaId}/dividas`} />
      {salvo && <p role="status" className="rounded-xl border border-positivo p-3 text-sm text-positivo">✓ Dívida cadastrada e parcelas geradas.</p>}

      <section className="cartao">
        <p className="text-sm text-suave">{NOME_TIPO_DIVIDA[d.tipo]} · {d.jurosMensaisPcm ? `${formatarPcm(d.jurosMensaisPcm)} ao mês` : "sem juros"}</p>
        <p className="mt-2 text-sm text-suave">Saldo devedor hoje</p>
        <Valor centavos={saldo} tamanho="xl" destaque />
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-suave">Contratado</dt><dd className="numero font-bold">{formatarReais(d.valorOriginalCentavos)}</dd></div>
          <div><dt className="text-suave">Parcela</dt><dd className="numero font-bold">{formatarReais(d.valorParcelaCentavos)}</dd></div>
          <div><dt className="text-suave">Juros já pagos</dt><dd className="numero font-bold">{formatarReais(jurosPagos)}</dd></div>
          <div><dt className="text-suave">Juros a pagar</dt><dd className="numero font-bold">{formatarReais(jurosAPagar)}</dd></div>
          <div><dt className="text-suave">Parcelas</dt><dd className="font-bold">{parcelas.length - abertas.length} de {parcelas.length} pagas</dd></div>
          <div><dt className="text-suave">Termina em</dt><dd className="font-bold">{formatarData(parcelas.at(-1)!.vencimento)}</dd></div>
        </dl>
        {d.observacao && <p className="mt-3 text-sm text-suave">{d.observacao}</p>}
      </section>

      {atrasadas > 0 && (
        <div className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-sm">
          <p className="font-bold text-negativo">▼ {atrasadas} parcela{atrasadas > 1 ? "s" : ""} em atraso</p>
          {gerencia && (
            <BotaoAcao acao={pagarAtrasadas.bind(null, empresaId, id)} className="mt-2 text-sm underline" confirmar="Marcar as parcelas atrasadas como pagas, na data de cada vencimento?">
              Já paguei: marcar como pagas
            </BotaoAcao>
          )}
        </div>
      )}

      <section className="cartao !p-0">
        <h2 className="border-b border-borda px-4 py-3 font-titulo text-lg font-bold">Parcelas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-suave">
              <tr>
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-2 py-2 font-medium">Vence</th>
                <th className="px-2 py-2 text-right font-medium">Parcela</th>
                <th className="px-2 py-2 text-right font-medium">Juros</th>
                <th className="px-2 py-2 text-right font-medium">Abate</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => {
                const atrasada = p.status === "a_pagar" && p.vencimento < hojeData;
                return (
                  <tr key={p.id} className={`border-t border-borda ${p.status === "pago" ? "text-suave" : ""}`}>
                    <td className="px-3 py-2">{p.numero}</td>
                    <td className={`px-2 py-2 ${atrasada ? "font-bold text-negativo" : ""}`}>{formatarDataCurta(p.vencimento)}/{p.vencimento.slice(2, 4)}</td>
                    <td className="numero px-2 py-2 text-right">{formatarReais(p.valor)}</td>
                    <td className="numero px-2 py-2 text-right">{formatarReais(p.juros)}</td>
                    <td className="numero px-2 py-2 text-right">{formatarReais(p.amortizacao)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "pago" ? (
                        gerencia ? (
                          <BotaoAcao acao={desfazerPagamentoParcela.bind(null, empresaId, p.id)} className="text-xs text-positivo" confirmar="Desfazer o pagamento desta parcela?">✓</BotaoAcao>
                        ) : <span className="text-xs text-positivo">✓</span>
                      ) : gerencia ? (
                        <BotaoAcao acao={pagarParcela.bind(null, empresaId, p.id)} className="whitespace-nowrap text-xs underline">pagar</BotaoAcao>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {gerencia && (
        <>
          <section className="cartao">
            <h2 className="mb-3 font-titulo text-lg font-bold">Editar dados</h2>
            <FormDescricaoDivida acao={atualizarDescricaoDivida.bind(null, empresaId, id)} inicial={{ credor: d.credor, tipo: d.tipo, observacao: d.observacao }} />
            <p className="mt-3 text-xs text-suave">Para mudar valores, juros ou parcelas (renegociação), exclua e cadastre a dívida de novo.</p>
          </section>
          <BotaoAcao acao={excluirDivida.bind(null, empresaId, id)} className="btn-perigo w-full" confirmar="Excluir esta dívida e todas as parcelas?">
            Excluir dívida
          </BotaoAcao>
        </>
      )}
    </div>
  );
}
