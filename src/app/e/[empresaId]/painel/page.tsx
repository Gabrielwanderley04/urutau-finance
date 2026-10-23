import Link from "next/link";
import { Ajuda } from "@/components/Ajuda";
import { GraficoMeses } from "@/components/GraficoMeses";
import { SeletorMes } from "@/components/SeletorMes";
import { AVISO_ESTIMATIVA } from "@/components/ImpostoDetalhe";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarDataCurta, hoje, mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais, razaoPcm } from "@/lib/dinheiro";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
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
  const { empresa } = await exigirAcesso(empresaId, "ver_painel");
  const atual = mesAtual();
  const mes = mesValido(mesParam) ? mesParam : atual;
  const hojeData = hoje();
  const db = obterDb();
  await prepararEmpresa(db, empresa, mes, atual);
  const { resumo: r, fontes, grafico, vencimentos, dividas, imposto } = await carregarPainel(db, empresa, mes, hojeData);
  const base = `/e/${empresaId}`;
  const nome = nomeDoMes(mes);
  const atrasadas = vencimentos.filter((v) => v.atrasado && v.tipo === "pagar");
  const totalPagar = vencimentos.filter((v) => v.tipo === "pagar").reduce((t, v) => t + v.valor, 0);
  const totalReceber = vencimentos.filter((v) => v.tipo === "receber").reduce((t, v) => t + v.valor, 0);

  return (
    <div className="space-y-4">
      <SeletorMes mes={mes} base={`${base}/painel`} mesAtual={atual} />

      {atrasadas.length > 0 && (
        <Link href={`${base}/contas`} className="block rounded-xl border border-negativo bg-negativo-fundo p-3 text-sm text-negativo">
          ▼ <strong>{atrasadas.length} {atrasadas.length === 1 ? "conta atrasada" : "contas atrasadas"}</strong> somando {formatarReais(atrasadas.reduce((t, v) => t + v.valor, 0))}. Ver agenda ›
        </Link>
      )}

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

        <Cartao
          titulo="Despesas"
          ajuda={<>Gastos do mês: o que você lançou, o custo real dos funcionários e os juros das dívidas. A parte da parcela que abate a dívida não é despesa. A guia de imposto paga também não entra aqui, porque o imposto já é descontado no cartão &quot;Impostos&quot;.</>}
          rodape={(r.folha > 0 || r.juros > 0) && <>Inclui {r.folha > 0 && <>folha {formatarReais(r.folha)}</>}{r.folha > 0 && r.juros > 0 && " e "}{r.juros > 0 && <>juros {formatarReais(r.juros)}</>}</>}
        >
          <Valor centavos={r.despesas} tamanho="md" />
        </Cartao>

        <Cartao
          titulo="Impostos estimados"
          ajuda={<>Estimativa do imposto do mês conforme o seu regime ({imposto.regime === "mei" ? "DAS fixo do MEI" : imposto.regime === "simples" ? "Simples Nacional" : imposto.regime === "presumido" ? "Lucro Presumido" : "Lucro Real"}). {AVISO_ESTIMATIVA}</>}
          rodape={
            imposto.regime === "real" ? "Cálculo disponível em breve. Consulte seu contador." :
            imposto.regime === "erro" ? <span className="text-negativo">{imposto.mensagem}</span> :
            <Link href={`${base}/impostos?mes=${mes}`} className="underline">{imposto.regime === "simples" ? `Alíquota efetiva ${formatarPcm(razaoPcm(r.impostos, r.faturamento) ?? 0, 2)} · ` : ""}como calculamos</Link>
          }
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
          ajuda={<>Dinheiro que realmente entrou e saiu no mês, pela data em que você recebeu ou pagou. Pode ser diferente do lucro: uma venda a prazo conta no lucro agora e no caixa só quando o dinheiro cair; a parcela inteira de uma dívida sai do caixa, mas só os juros são despesa; a reserva de 13º e férias pesa no lucro, mas só sai do caixa quando for paga.</>}
          rodape={<>Entrou {formatarReais(r.caixa.entradas)} · Saiu {formatarReais(r.caixa.saidas)}</>}
        >
          <Valor centavos={r.caixa.saldo} tamanho="lg" sinalPositivo />
        </Cartao>

        <Cartao
          grande
          titulo="Total em dívidas"
          ajuda={<>Quanto a empresa ainda deve (sem contar juros futuros) em empréstimos, financiamentos e parcelamentos, no fim de {nome}.</>}
          rodape={
            dividas.quantidade > 0 ? (
              <><Link href={`${base}/dividas`} className="underline">{dividas.quantidade} dívida{dividas.quantidade > 1 ? "s" : ""}</Link> · vence em {nome}: {formatarReais(dividas.venceNoMes)}</>
            ) : (
              <Link href={`${base}/dividas`} className="underline">Cadastrar dívidas</Link>
            )
          }
        >
          <Valor centavos={dividas.saldo} tamanho="lg" />
        </Cartao>
      </div>

      {imposto.regime === "mei" && (imposto.mei.situacao !== "ok") && (
        <Link href={`${base}/impostos?mes=${mes}`} className={`block rounded-xl border p-3 text-sm ${imposto.mei.situacao === "alerta" ? "aviso" : "border-negativo bg-negativo-fundo text-negativo"}`}>
          {imposto.mei.situacao === "alerta" ? "⚠" : "▼"} Faturamento do ano em <strong>{formatarPcm(imposto.mei.usoDoLimite, 0)}</strong> do limite do MEI ({formatarReais(imposto.mei.faturamentoAno)} de {formatarReais(imposto.mei.limite)}). Ver detalhes ›
        </Link>
      )}
      <p className="text-center text-xs text-suave">
        {r.impostosDisponiveis ? <>⚠ Impostos: {AVISO_ESTIMATIVA}</> : <>O lucro não desconta impostos: {imposto.regime === "real" ? "cálculo do Lucro Real disponível em breve. Consulte seu contador." : "não foi possível estimá-los."}</>}
      </p>

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
                <Link href={`${base}/${v.link}`} className="flex items-center justify-between gap-3 py-2.5">
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
        <Link href={`${base}/contas`} className="mt-2 inline-block text-sm underline">Ver agenda completa (30 dias)</Link>
      </section>
    </div>
  );
}
