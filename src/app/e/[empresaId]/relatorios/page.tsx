import { SeletorMes } from "@/components/SeletorMes";
import { mesAtual, mesValido, nomeDoMes } from "@/lib/datas";
import { NOME_SECAO, SECOES } from "@/lib/relatorios/secoes";
import { exigirAcesso } from "@/lib/servidor/acesso";

export const metadata = { title: "Relatórios" };

const DESCRICAO: Record<(typeof SECOES)[number], string> = {
  resumo: "Faturamento, impostos, despesas, lucro, caixa e dívidas",
  vendas: "Cada venda com fonte, forma de pagamento e recebimento",
  despesas: "Cada despesa com categoria, vencimento e pagamento",
  folha: "Custo de cada funcionário, linha a linha, e 13º/férias pagos",
  dividas: "Parcela do mês com juros e amortização, saldo devedor",
  impostos: "Base, alíquota e valor estimado de cada imposto",
};

export default async function Relatorios({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const { empresa } = await exigirAcesso(empresaId, "ver_painel");
  const atual = mesAtual();
  const mes = mesValido(sp.mes) ? sp.mes : atual;
  const base = `/e/${empresaId}`;
  const arquivo = (nome: string) => `${base}/relatorios/arquivo/${nome}?mes=${mes}`;

  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl font-bold">Relatórios</h1>
      <SeletorMes mes={mes} base={`${base}/relatorios`} mesAtual={atual} />
      <section className="cartao space-y-3">
        <h2 className="font-titulo text-lg font-bold">Para enviar ao contador</h2>
        <p className="text-sm text-suave">
          Tudo de {nomeDoMes(mes)} da {empresa.nome}: vendas, despesas, funcionários, dívidas e impostos.
        </p>
        <a href={arquivo("todos.zip")} download className="btn-principal w-full">⬇ Baixar tudo (.zip com PDF e planilhas)</a>
        <a href={arquivo("relatorio.pdf")} download className="btn-secundario w-full">⬇ Só o PDF</a>
      </section>
      <section className="cartao !p-0">
        <h2 className="border-b border-borda px-4 py-3 font-titulo text-lg font-bold">Planilhas (CSV)</h2>
        <ul className="divide-y divide-borda">
          {SECOES.map((s) => (
            <li key={s}>
              <a href={arquivo(`${s}.csv`)} download className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-medium">{NOME_SECAO[s]}</span>
                  <span className="text-xs text-suave">{DESCRICAO[s]}</span>
                </span>
                <span aria-hidden className="text-xl text-suave">⬇</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-suave">As planilhas abrem direto no Excel e no Google Planilhas (separadas por ponto e vírgula, com vírgula decimal).</p>
      <p className="aviso">Os impostos do relatório são estimados. Confirme com o seu contador.</p>
    </div>
  );
}
