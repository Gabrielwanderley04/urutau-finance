import Link from "next/link";
import { Valor } from "@/components/Valor";
import { type ImpostoMes, type Series, receitaTotal } from "@/lib/calculos/impostos";
import { type Mes, nomeDoMes, somarMeses } from "@/lib/datas";
import { PCM_100, dividirParaCima, formatarPcm, formatarReais } from "@/lib/dinheiro";

export const AVISO_ESTIMATIVA = "Valor estimado. Confirme com o seu contador.";

function Passo({ n, titulo, children }: { n?: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao space-y-2 text-sm leading-relaxed">
      <h2 className="flex items-center gap-2 font-titulo text-lg font-bold">
        {n !== undefined && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destaque text-sm text-sobre-destaque">{n}</span>
        )}
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => <strong className="numero whitespace-nowrap">{children}</strong>;

export function DetalheSimples({ r, mes, series, base, inicioAtividade }: { r: Extract<ImpostoMes, { regime: "simples" }>; mes: Mes; series: Series; base: string; inicioAtividade: Mes | null }) {
  const s = r.simples;
  const rbt = s.rbt12;
  // Meses da janela sem faturamento lançado nem informado (provável falta de histórico).
  const janela = Array.from({ length: 12 }, (_, i) => somarMeses(mes, -i - 1)).filter((m) => !inicioAtividade || m >= inicioAtividade);
  const semDados = rbt.metodo === "soma_12" ? janela.filter((m) => receitaTotal(series, m) === 0).length : 0;
  let passo = 1;

  return (
    <>
      <Passo n={passo++} titulo="Faturamento dos últimos 12 meses">
        <p>
          O Simples usa a receita dos 12 meses <strong>anteriores</strong> (chamada RBT12) para descobrir a faixa e a alíquota.
        </p>
        <Valor centavos={rbt.valor} tamanho="lg" destaque />
        <p className="text-suave">
          {rbt.metodo === "soma_12" && <>Soma de {nomeDoMes(somarMeses(mes, -12))} a {nomeDoMes(somarMeses(mes, -1))}.</>}
          {rbt.metodo === "primeiro_mes" && <>Primeiro mês de atividade: a lei manda usar o faturamento do próprio mês × 12.</>}
          {rbt.metodo === "media_proporcional" && (
            <>A empresa tem {rbt.mesesConsiderados} {rbt.mesesConsiderados === 1 ? "mês" : "meses"} de atividade: usamos a média desses meses × 12, como manda a lei.</>
          )}
        </p>
        {semDados > 0 && (
          <p className="text-negativo">
            ▼ {semDados} {semDados === 1 ? "mês" : "meses"} desse período sem faturamento. Se a empresa já existia, <Link href={`${base}/ajustes/historico`} className="underline">informe o histórico</Link>: sem ele, o imposto sai menor do que o real.
          </p>
        )}
        <Link href={`${base}/ajustes/historico`} className="inline-block text-suave underline">Ver ou informar os meses anteriores</Link>
      </Passo>

      {s.fatorR && (
        <Passo n={passo++} titulo="Fator R">
          <p>Sua atividade muda de anexo conforme o peso da folha de pagamento (salários, pró-labore, FGTS e 13º) no faturamento.</p>
          <p>
            Folha dos últimos 12 meses: <Num>{formatarReais(s.fatorR.folha12)}</Num> ÷ faturamento <Num>{formatarReais(s.fatorR.rbt12)}</Num> ={" "}
            <Num>{s.fatorR.fator === null ? "—" : formatarPcm(s.fatorR.fator)}</Num>
          </p>
          <p className={s.fatorR.anexo === "III" ? "text-positivo" : ""}>
            {s.fatorR.anexo === "III"
              ? "✓ 28% ou mais: você paga pelo Anexo III, que é mais barato."
              : "Menos de 28%: você paga pelo Anexo V, que é mais caro."}
          </p>
          {s.fatorR.anexo === "V" && s.fatorR.rbt12 > 0 && (
            <p className="text-suave">
              Para ir ao Anexo III, a folha dos 12 meses precisaria ser de pelo menos{" "}
              <Num>{formatarReais(dividirParaCima(BigInt(s.fatorR.rbt12) * 28_000n, PCM_100))}</Num>. Converse com o seu contador sobre ajustar o pró-labore.
            </p>
          )}
        </Passo>
      )}

      {s.parcelas.map((p) => (
        <Passo key={p.natureza} n={passo++} titulo={`${p.natureza === "comercio" ? "Vendas de produtos" : "Serviços"}: Anexo ${p.anexo}`}>
          <p>
            Com {formatarReais(rbt.valor)} nos últimos 12 meses, a empresa está na <strong>{p.faixa.faixa}ª faixa</strong> (até {formatarReais(p.faixa.receitaAte)}): alíquota de{" "}
            <Num>{formatarPcm(p.faixa.aliquotaNominal)}</Num>
            {p.faixa.parcelaDeduzir > 0 && <> com parcela a deduzir de <Num>{formatarReais(p.faixa.parcelaDeduzir)}</Num></>}.
          </p>
          {p.faixa.parcelaDeduzir > 0 && (
            <p className="rounded-xl bg-superficie-2 p-3 text-xs">
              Alíquota efetiva = (RBT12 × alíquota − parcela a deduzir) ÷ RBT12
              <br />= ({formatarReais(rbt.valor)} × {formatarPcm(p.faixa.aliquotaNominal)} − {formatarReais(p.faixa.parcelaDeduzir)}) ÷ {formatarReais(rbt.valor)} ={" "}
              <Num>{formatarPcm(p.aliquotaEfetiva, 3)}</Num>
            </p>
          )}
          <p>
            Faturamento do mês <Num>{formatarReais(p.receita)}</Num> × <Num>{formatarPcm(p.aliquotaEfetiva, 3)}</Num> = <Num>{formatarReais(p.imposto)}</Num>
          </p>
        </Passo>
      ))}

      {s.acimaDoLimite && <p className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-sm text-negativo">▼ O faturamento dos 12 meses passou de R$ 4,8 milhões, o limite do Simples Nacional. A empresa pode ser excluída do regime. Fale com o seu contador agora.</p>}
      {!s.acimaDoLimite && s.acimaDoSublimite && <p className="aviso">O faturamento passou de R$ 3,6 milhões: o ICMS e o ISS passam a ser pagos fora do DAS. Esta estimativa não inclui essa parte.</p>}
      <p className="text-sm text-suave">O DAS vence no dia 20 do mês seguinte.</p>
    </>
  );
}

export function DetalheMei({ r }: { r: Extract<ImpostoMes, { regime: "mei" }> }) {
  const m = r.mei;
  const largura = Math.min(100, m.usoDoLimite / 1000);
  const cor = m.situacao === "ok" ? "var(--serie-lucro)" : m.situacao === "alerta" ? "var(--destaque)" : "var(--negativo)";
  return (
    <>
      <Passo titulo="DAS do MEI">
        <p>O MEI paga um valor fixo por mês, não importa quanto vendeu. Ele inclui o INSS do dono e o ICMS e/ou o ISS.</p>
        <p>Valor deste ano: <Num>{formatarReais(m.das)}</Num>. Vence no dia 20 de cada mês.</p>
      </Passo>
      <Passo titulo="Limite de faturamento do ano">
        <p>
          Faturado no ano até este mês: <Num>{formatarReais(m.faturamentoAno)}</Num> de <Num>{formatarReais(m.limite)}</Num>
          {m.limiteProporcional && " (limite proporcional porque a empresa abriu este ano: R$ 6.750 por mês)"}.
        </p>
        <div className="h-3 rounded-full bg-superficie-2" role="img" aria-label={`${formatarPcm(m.usoDoLimite, 0)} do limite usado`}>
          <div className="h-3 rounded-full" style={{ width: `${largura}%`, background: cor }} />
        </div>
        <p className="numero text-right font-bold">{formatarPcm(m.usoDoLimite, 1)} do limite</p>
        {m.situacao === "ok" && <p className="text-positivo">✓ Dentro do limite. Ainda pode faturar {formatarReais(m.folga)} este ano.</p>}
        {m.situacao === "alerta" && (
          <p className="aviso">⚠ Você já usou mais de 80% do limite. Restam <strong>{formatarReais(m.folga)}</strong> para o ano. Converse com o seu contador sobre a mudança para o Simples Nacional antes de passar do limite.</p>
        )}
        {m.situacao === "acima_do_limite" && (
          <p className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-negativo">▼ Passou do limite em até 20%. Você vai pagar imposto sobre o excesso e deixa de ser MEI a partir de janeiro. Procure o seu contador.</p>
        )}
        {m.situacao === "acima_20_porcento" && (
          <p className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-negativo">▼ Passou mais de 20% do limite. O desenquadramento volta para janeiro (ou para a abertura) e os impostos do ano são recalculados como Simples Nacional. Procure o seu contador com urgência.</p>
        )}
      </Passo>
    </>
  );
}

export function DetalhePresumido({ r, base }: { r: Extract<ImpostoMes, { regime: "presumido" }>; base: string }) {
  const p = r.presumido;
  const t = r.trimestre;
  return (
    <>
      <Passo titulo="Como funciona">
        <p>
          No Lucro Presumido, a lei &quot;presume&quot; que uma parte do faturamento é lucro: <strong>8%</strong> no comércio e <strong>32%</strong> nos serviços para o IRPJ
          (12% e 32% para a CSLL). O imposto de renda incide só sobre essa parte. PIS, Cofins, ISS e ICMS incidem sobre o faturamento todo.
        </p>
      </Passo>
      <section className="cartao !p-0">
        <h2 className="border-b border-borda px-4 py-3 font-titulo text-lg font-bold">Impostos de {formatarReais(p.receita)} de faturamento</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] sm:text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="px-4 py-2 font-medium">Imposto</th>
              <th className="px-2 py-2 text-right font-medium">Base</th>
              <th className="px-2 py-2 text-right font-medium">%</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {p.linhas.map((l) => (
              <tr key={l.chave} className="border-t border-borda">
                <td className="py-2 pl-4 pr-1">{l.nome}</td>
                <td className="numero whitespace-nowrap px-1 py-2 text-right">{formatarReais(l.base)}</td>
                <td className="numero px-1 py-2 text-right">{formatarPcm(l.aliquota)}</td>
                <td className="numero whitespace-nowrap py-2 pl-1 pr-4 text-right font-bold">{formatarReais(l.valor)}</td>
              </tr>
            ))}
            <tr className="border-t border-borda font-bold">
              <td className="px-4 py-2" colSpan={3}>Total</td>
              <td className="numero px-4 py-2 text-right">{formatarReais(p.total)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>
      {p.faltaAliquota.length > 0 && (
        <p className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-sm text-negativo">
          ▼ Falta informar a alíquota de {p.faltaAliquota.map((a) => a.toUpperCase()).join(" e ")}. Ela ficou como zero.{" "}
          <Link href={`${base}/ajustes`} className="underline">Informar agora</Link>
        </p>
      )}
      {p.receitaAcimaLc224 > 0 && (
        <p className="aviso">
          A receita do ano passou de R$ 5 milhões. Pela LC 224/2025, os percentuais de presunção ficam 10% maiores sobre os {formatarReais(p.receitaAcimaLc224)} que passaram do limite neste mês.
        </p>
      )}
      <Passo titulo="IRPJ e CSLL são trimestrais">
        <p>
          O IRPJ e a CSLL são apurados por trimestre e vencem no último dia útil do mês seguinte ao fim do trimestre. No painel, mostramos a parte de cada mês, com o adicional
          de 10% sobre o que passar de R$ 20 mil de base no mês.
        </p>
        <p>
          No trimestre até agora: IRPJ <Num>{formatarReais(t.irpj)}</Num> + adicional <Num>{formatarReais(t.adicional)}</Num> + CSLL <Num>{formatarReais(t.csll)}</Num> ={" "}
          <Num>{formatarReais(t.total)}</Num>.
        </p>
        {t.diferencaDaSomaMensal !== 0 && (
          <p className="text-suave">
            Na apuração do trimestre, o adicional considera R$ 60 mil no trimestre todo, por isso o valor real fica {formatarReais(Math.abs(t.diferencaDaSomaMensal))}{" "}
            {t.diferencaDaSomaMensal > 0 ? "maior" : "menor"} que a soma das estimativas mensais.
          </p>
        )}
        <p className="text-suave">PIS e Cofins vencem no dia 25 do mês seguinte. ISS e ICMS seguem o calendário da prefeitura e do estado.</p>
      </Passo>
    </>
  );
}
