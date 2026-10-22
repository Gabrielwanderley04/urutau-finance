import { and, eq, gte, lte } from "drizzle-orm";
import { Cabecalho } from "@/components/Campos";
import { FormHistorico } from "@/components/FormHistorico";
import { obterDb } from "@/db";
import { receitasHistoricas } from "@/db/schema";
import { folhaTotal } from "@/lib/calculos/impostos";
import { mesAtual, somarMeses, ultimosMeses } from "@/lib/datas";
import { centavosParaInput } from "@/lib/dinheiro";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarHistorico } from "@/lib/servidor/acoes-ajustes";
import { carregarSeries } from "@/lib/servidor/fiscal";

export const metadata = { title: "Histórico de faturamento" };

export default async function Historico({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  const db = obterDb();
  const meses = ultimosMeses(somarMeses(mesAtual(), -1), 12).reverse();
  const [series, informados] = await Promise.all([
    carregarSeries(db, empresaId, meses.at(-1)!, meses[0]),
    db
      .select()
      .from(receitasHistoricas)
      .where(and(eq(receitasHistoricas.empresaId, empresaId), gte(receitasHistoricas.competencia, meses.at(-1)!), lte(receitasHistoricas.competencia, meses[0]))),
  ]);
  const porMes = new Map(informados.map((h) => [h.competencia, h]));
  const linhas = meses.map((mes) => {
    const v = series.get(mes);
    const h = porMes.get(mes);
    return {
      mes,
      receitaLancada: v ? v.comercio + v.servico : 0,
      // folha calculada sem o valor informado à mão
      folhaLancada: v ? folhaTotal(new Map([[mes, { ...v, folhaHistorica: null }]]), mes) : 0,
      receitaInformada: h?.receitaCentavos != null ? centavosParaInput(h.receitaCentavos) : "",
      folhaInformada: h?.folhaCentavos != null ? centavosParaInput(h.folhaCentavos) : "",
    };
  });
  return (
    <>
      <Cabecalho titulo="Últimos 12 meses" voltar={`/e/${empresaId}/impostos`} />
      <div className="aviso mb-4 space-y-2">
        <p>
          O imposto do Simples depende do faturamento dos <strong>12 meses anteriores</strong>, e o Fator R depende da folha desses meses.
          Se você começou a usar o urutau agora, informe aqui os meses anteriores (estão no extrato do Simples ou com o seu contador).
        </p>
        <p className="text-suave">Um valor informado aqui substitui o que foi lançado no urutau naquele mês. Deixe em branco para usar os lançamentos.</p>
      </div>
      <FormHistorico acao={salvarHistorico.bind(null, empresaId, meses)} linhas={linhas} />
    </>
  );
}
