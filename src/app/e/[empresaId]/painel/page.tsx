import Link from "next/link";
import { Ajuda } from "@/components/Ajuda";
import { GraficoMeses } from "@/components/GraficoMeses";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais } from "@/lib/dinheiro";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { carregarPainel } from "@/lib/servidor/painel";

export const metadata = { title: "Painel" };

const LIMITE_VENCIMENTOS = 8;

function Cartao({
  titulo,
  ajuda,
  children,
  rodape,
  grande = false,
}: {
  titulo: string;
  ajuda: React.ReactNode;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  grande?: boolean;
}) {
  return (
    <section className={`cartao relative ${grande ? "col-span-2" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-suave">{titulo}</h2>
        <Ajuda titulo={titulo}>{ajuda}</Ajuda>
      </div>
      {children}
      {rodape && <div className="mt-1 text-xs text-suave">{rodape}</div>}
    </section>
  );
}

export default async function Painel({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const { mes: mesParam } = await searchParams;
  await exigirAcesso(empresaId, "ver_painel");
  const atual = mesAtual();
  const mes = mesValido(mesParam) ? mesParam : atual;
  const hojeData = hoje();
  const { resumo: r, fontes, grafico, vencimentos } = await carregarPainel(obterDb(), empresaId, mes, hojeData);
  const base = `/e/${empresaId}`;
  const nome = nomeDoMes(mes);
  const totalPagar = vencimentos.filter((v) => v.tipo === "pagar").reduce((t, v) => t + v.valor, 0);
  const totalReceber = vencimentos.filter((v) => v.tipo === "receber").reduce((t, v) => t + v.valor, 0);

  return (
    <div className="space-y-4">
      <SeletorMes mes={mes} base={`${base}/painel`} mesAtual={atual} />

      <div className="grid grid-cols-2 gap-3">
        <Cartao
          grande
          titulo="Lucro líquido"
          ajuda={<>Quanto sobrou: faturamento − impostos − despesas (inclui mercadorias, funcionários, juros e pró-labore).</>}
          rodape={
            r.margem === null ? "Sem vendas no mês" : (
              <>Margem de <strong className={r.margem < 0 ? "text-negativo" : "text-texto"}>{formatarPcm(r.margem, 1)}</strong>: de cada R$ 100 vendidos, {r.lucro >= 0 ? "sobraram" : "faltaram"} {formatarReais(Math.abs(Math.round((r.margem ?? 0) / 10)))}.</>
            )
          }
        >
          <Valor centavos={r.lucro} tamanho="xl" destaque />
          {r.lucro < 0 && <p className="mt-1 text-sm font-medium text-negativo">Prejuízo em {nome}</p>}
        </Cartao>

        <Cartao titulo="Faturamento" ajuda={<>Tudo o que você vendeu no mês, recebido ou não.</>}>
          <Valor centavos={r.faturamento} tamanho="md" />
        </Cartao>

        <Cartao titulo="Despesas" ajuda={<>Gastos do mês, pela data da despesa. A guia de imposto paga não entra aqui, porque o imposto já é descontado no cartão &quot;Impostos&quot;.</>}>
          <Valor centavos={r.despesas} tamanho="md" />
        </Cartao>

        <Cartao
          titulo="Impostos estimados"
          ajuda={<>Estimativa do imposto sobre as vendas do mês, conforme o seu regime. Valor estimado. Confirme com o seu contador.</>}
          rodape="Cálculo chega na próxima versão"
        >
          {r.impostosDisponiveis ? <Valor centavos={r.impostos} tamanho="md" /> : <span className="numero text-2xl font-bold text-suave">—</span>}
        </Cartao>

        <Cartao titulo="Margem" ajuda={<>Lucro dividido pelo faturamento. Mostra quanto de cada venda vira lucro.</>}>
          <span className={`numero whitespace-nowrap text-2xl font-bold ${r.margem !== null && r.margem < 0 ? "text-negativo" : ""}`}>
            {r.margem !== null && r.margem < 0 && <span aria-hidden className="mr-1 align-middle text-[0.6em]">▼</span>}
            {r.margem === null ? "—" : formatarPcm(r.margem, 1).replace("-", "−")}
          </span>
        </Cartao>

        <Cartao
          grande
          titulo="Caixa do mês"
          ajuda={<>Dinheiro que realmente entrou e saiu no mês, pela data em que você recebeu ou pagou. Pode ser diferente do lucro: uma venda a prazo conta no lucro agora e no caixa só quando o dinheiro cair.</>}
          rodape={<>Entrou {formatarReais(r.caixa.entradas)} · Saiu {formatarReais(r.caixa.saidas)}</>}
        >
          <Valor centavos={r.caixa.saldo} tamanho="lg" sinalPositivo />
        </Cartao>

        <Cartao grande titulo="Total em dívidas" ajuda={<>Soma do que a empresa ainda deve em empréstimos, financiamentos e parcelamentos.</>} rodape="Cadastro de dívidas chega na próxima fase">
          <span className="numero text-3xl font-bold text-suave">—</span>
        </Cartao>
      </div>

      {!r.impostosDisponiveis && (
        <p className="rounded-xl bg-aviso-fundo p-3 text-sm">
          ⚠ O lucro acima ainda <strong>não desconta impostos</strong>. O cálculo dos impostos chega na próxima versão.
        </p>
      )}

      <section className="cartao relative">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="font-titulo text-lg font-bold">Ponto de equilíbrio</h2>
          <Ajuda titulo="ponto de equilíbrio">
            É o faturamento mínimo para não ter prejuízo. Consideramos que despesas <strong>fixas</strong> (aluguel, salários) não mudam e que as <strong>variáveis</strong> (mercadorias, impostos) crescem junto com as vendas. Você define o que é fixo ou variável em Ajustes → Categorias.
          </Ajuda>
        </div>
        {r.pontoEquilibrio.tipo === "valor" ? (
          <>
            <p className="text-suave">Para não ter prejuízo em {nome}, a empresa precisa faturar</p>
            <Valor centavos={r.pontoEquilibrio.valor} tamanho="lg" destaque />
            <p className={`mt-2 text-sm ${r.pontoEquilibrio.folga < 0 ? "text-negativo" : "text-positivo"}`}>
              {r.pontoEquilibrio.folga >= 0
                ? `✓ Você já passou do ponto em ${formatarReais(r.pontoEquilibrio.folga)}.`
                : `▼ Faltam ${formatarReais(-r.pontoEquilibrio.folga)} em vendas para empatar.`}
            </p>
          </>
        ) : r.pontoEquilibrio.tipo === "sem_faturamento" ? (
          <p className="text-suave">Lance as vendas do mês para calcular.</p>
        ) : (
          <p className="text-negativo">▼ Os custos variáveis (mercadorias e impostos) passaram do faturamento: cada venda está dando prejuízo. Revise os preços.</p>
        )}
      </section>

      <section className="cartao">
        <h2 className="mb-3 font-titulo text-lg font-bold">De onde veio o faturamento</h2>
        {fontes.length === 0 ? (
          <p className="text-suave">Nenhuma venda em {nome}.</p>
        ) : (
          <ul className="space-y-3">
            {fontes.map((f) => (
              <li key={f.id}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{f.nome}</span>
                  <span><span className="numero font-bold">{formatarReais(f.valor)}</span> <span className="text-suave">· {formatarPcm(f.participacao, 1)}</span></span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-superficie-2">
                  <div className="h-2 rounded-full bg-[var(--serie-faturamento)]" style={{ width: `${f.participacao / 1000}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GraficoMeses dados={grafico} />

      <section className="cartao">
        <h2 className="font-titulo text-lg font-bold">Vence nos próximos 7 dias</h2>
        {vencimentos.length > 0 && (
          <p className="mb-2 text-sm text-suave">
            A pagar <strong className="text-texto">{formatarReais(totalPagar)}</strong> · A receber{" "}
            <strong className="text-texto">{formatarReais(totalReceber)}</strong>
          </p>
        )}
        {vencimentos.length === 0 ? (
          <p className="text-suave">Nada a pagar ou receber nos próximos 7 dias. 🎉</p>
        ) : (
          <ul className="divide-y divide-borda">
            {vencimentos.slice(0, LIMITE_VENCIMENTOS).map((v) => (
              <li key={`${v.tipo}-${v.id}`}>
                <Link href={`${base}/${v.tipo === "pagar" ? "despesas" : "vendas"}/${v.id}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate">{v.descricao}</span>
                    <span className={`text-xs ${v.atrasado ? "font-bold text-negativo" : "text-suave"}`}>
                      {v.tipo === "pagar" ? "Pagar" : "Receber"} · {v.atrasado ? `atrasado desde ${formatarDataCurta(v.data)}` : v.data === hojeData ? "hoje" : formatarDataCurta(v.data)}
                    </span>
                  </span>
                  <Valor centavos={v.tipo === "pagar" ? -v.valor : v.valor} tamanho="sm" sinalPositivo />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {vencimentos.length > LIMITE_VENCIMENTOS && (
          <p className="pt-2 text-sm text-suave">+ {vencimentos.length - LIMITE_VENCIMENTOS} outros lançamentos nos próximos dias</p>
        )}
      </section>
    </div>
  );
}
