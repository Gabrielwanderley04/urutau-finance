import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatarCnpj } from "@/lib/validacao";
import { formatarData, nomeDoMes } from "@/lib/datas";
import { formatarPcm, formatarReais } from "@/lib/dinheiro";
import { NOME_FORMA } from "@/lib/rotulos";
import type { Relatorio } from "@/lib/servidor/relatorio";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";

const fonte = (pacote: string, arquivo: string) => path.join(process.cwd(), "node_modules/@fontsource", pacote, "files", arquivo);
Font.register({
  family: "DM Sans",
  fonts: [
    { src: fonte("dm-sans", "dm-sans-latin-400-normal.woff") },
    { src: fonte("dm-sans", "dm-sans-latin-700-normal.woff"), fontWeight: 700 },
  ],
});
Font.register({ family: "Space Grotesk", src: fonte("space-grotesk", "space-grotesk-latin-700-normal.woff"), fontWeight: 700 });
Font.registerHyphenationCallback((palavra) => [palavra]);

const COR = { noite: "#141B34", destaque: "#F5C518", claro: "#E9E6E0", texto: "#141B34", suave: "#5B6078", borda: "#D8D4CC", negativo: "#C0262D", fundo: "#F7F5F1" };

const s = StyleSheet.create({
  pagina: { fontFamily: "DM Sans", fontSize: 8.5, color: COR.texto, paddingTop: 28, paddingBottom: 44, paddingHorizontal: 30 },
  cabecalho: { backgroundColor: COR.noite, color: COR.claro, borderRadius: 6, padding: 14, marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
  marca: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12 },
  titulo: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, marginTop: 6 },
  secao: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 11, marginTop: 14, marginBottom: 6 },
  cartoes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cartao: { width: "32.4%", borderWidth: 1, borderColor: COR.borda, borderRadius: 5, padding: 8, backgroundColor: COR.fundo },
  rotulo: { color: COR.suave, fontSize: 7.5 },
  numero: { fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, marginTop: 2 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COR.borda, paddingVertical: 3 },
  cabecalhoTabela: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COR.noite, paddingVertical: 3, fontWeight: 700 },
  aviso: { marginTop: 6, padding: 6, borderLeftWidth: 3, borderLeftColor: COR.destaque, backgroundColor: COR.fundo, fontSize: 8 },
  rodape: { position: "absolute", bottom: 18, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", color: COR.suave, fontSize: 7 },
});

/** "-" comum (as fontes não têm o sinal de menos tipográfico). */
const dinheiro = (c: number) => formatarReais(c).replace(/ /g, " ");
const corDe = (c: number) => (c < 0 ? COR.negativo : COR.texto);

interface Coluna {
  titulo: string;
  largura: number;
  direita?: boolean;
}

function Tabela({ colunas, linhas, total }: { colunas: Coluna[]; linhas: (string | { t: string; cor?: string })[][]; total?: string[] }) {
  const celula = (c: Coluna, v: string | { t: string; cor?: string }, i: number, negrito = false) => {
    const t = typeof v === "string" ? v : v.t;
    const cor = typeof v === "string" ? undefined : v.cor;
    return (
      <Text key={i} style={{ width: `${c.largura}%`, textAlign: c.direita ? "right" : "left", paddingHorizontal: 2, color: cor, fontWeight: negrito ? 700 : 400 }}>
        {t}
      </Text>
    );
  };
  return (
    <View>
      <View style={s.cabecalhoTabela} fixed>
        {colunas.map((c, i) => celula(c, c.titulo, i, true))}
      </View>
      {linhas.map((l, j) => (
        <View key={j} style={s.linha} wrap={false}>
          {colunas.map((c, i) => celula(c, l[i] ?? "", i))}
        </View>
      ))}
      {total && (
        <View style={[s.linha, { borderBottomWidth: 0 }]}>
          {colunas.map((c, i) => celula(c, total[i] ?? "", i, true))}
        </View>
      )}
    </View>
  );
}

function Cartao({ rotulo, valor, cor, nota }: { rotulo: string; valor: string; cor?: string; nota?: string }) {
  return (
    <View style={s.cartao}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={[s.numero, { color: cor ?? COR.texto }]}>{valor}</Text>
      {nota && <Text style={[s.rotulo, { marginTop: 2 }]}>{nota}</Text>}
    </View>
  );
}

const STATUS: Record<string, string> = { recebido: "Recebido", a_receber: "A receber", pago: "Pago", a_pagar: "A pagar" };
const REGIME = { mei: "MEI", simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" } as const;

function RelatorioPdf({ r }: { r: Relatorio }) {
  const p = r.painel.resumo;
  const e = r.empresa;
  const porFonte = r.painel.fontes;
  const porCategoria = new Map<string, number>();
  for (const d of r.despesas) porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + d.valor);

  return (
    <Document title={`Relatório ${nomeDoMes(r.mes)} · ${e.nome}`} author="urutau gestão" language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecalho}>
          <View>
            <Text style={s.marca}>
              urutau<Text style={{ color: COR.destaque }}> gestão</Text>
            </Text>
            <Text style={s.titulo}>{e.nome}</Text>
            <Text style={{ marginTop: 3 }}>
              {[e.cnpj ? `CNPJ ${formatarCnpj(e.cnpj)}` : null, [e.cidade, e.uf].filter(Boolean).join("/") || null, REGIME[e.regime]].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", justifyContent: "flex-end" }}>
            <Text style={{ color: COR.destaque, fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12 }}>Relatório mensal</Text>
            <Text style={{ fontSize: 11, marginTop: 2 }}>{nomeDoMes(r.mes)}</Text>
          </View>
        </View>

        <View style={s.cartoes}>
          <Cartao rotulo="Faturamento" valor={dinheiro(p.faturamento)} />
          <Cartao rotulo="Impostos estimados" valor={p.impostosDisponiveis ? dinheiro(p.impostos) : "-"} nota={p.impostosDisponiveis ? undefined : "Lucro Real: consulte o contador"} />
          <Cartao rotulo="Despesas" valor={dinheiro(p.despesas)} nota={`Folha ${dinheiro(p.folha)} · juros ${dinheiro(p.juros)}`} />
          <Cartao rotulo={p.lucro < 0 ? "Prejuízo" : "Lucro líquido"} valor={dinheiro(p.lucro)} cor={corDe(p.lucro)} />
          <Cartao rotulo="Margem" valor={p.margem === null ? "-" : formatarPcm(p.margem, 1)} cor={corDe(p.margem ?? 0)} />
          <Cartao rotulo="Caixa do mês" valor={dinheiro(p.caixa.saldo)} cor={corDe(p.caixa.saldo)} nota={`Entrou ${dinheiro(p.caixa.entradas)} · saiu ${dinheiro(p.caixa.saidas)}`} />
        </View>
        <Text style={{ marginTop: 6 }}>
          Total em dívidas no fim do mês: {dinheiro(r.painel.dividas.saldo)}
          {p.pontoEquilibrio.tipo === "valor" && ` · Ponto de equilíbrio: ${dinheiro(p.pontoEquilibrio.valor)}`}
        </Text>

        <Text style={s.secao}>Impostos</Text>
        {r.impostos.length ? (
          <Tabela
            colunas={[{ titulo: "Imposto", largura: 52 }, { titulo: "Base", largura: 18, direita: true }, { titulo: "Alíquota", largura: 12, direita: true }, { titulo: "Valor", largura: 18, direita: true }]}
            linhas={r.impostos.map((i) => [i.descricao, i.base === null ? "" : dinheiro(i.base), i.aliquota === null ? "" : formatarPcm(i.aliquota, 3), dinheiro(i.valor)])}
            total={["Total", "", "", dinheiro(r.impostos.reduce((t, i) => t + i.valor, 0))]}
          />
        ) : (
          <Text>Cálculo disponível em breve. Consulte seu contador.</Text>
        )}
        <Text style={s.aviso}>Valor estimado. Confirme com o seu contador.</Text>

        <Text style={s.secao}>Faturamento por fonte</Text>
        <Tabela
          colunas={[{ titulo: "Fonte", largura: 60 }, { titulo: "Participação", largura: 20, direita: true }, { titulo: "Valor", largura: 20, direita: true }]}
          linhas={porFonte.map((f) => [f.nome, formatarPcm(f.participacao, 1), dinheiro(f.valor)])}
          total={["Total", "", dinheiro(p.faturamento)]}
        />

        <Text style={s.secao}>Despesas por categoria</Text>
        <Tabela
          colunas={[{ titulo: "Categoria", largura: 80 }, { titulo: "Valor", largura: 20, direita: true }]}
          linhas={[
            ...[...porCategoria.entries()].map(([c, v]) => [c, dinheiro(v)]),
            ...(p.folha ? [["Folha de pagamento (custo real)", dinheiro(p.folha)]] : []),
            ...(p.juros ? [["Juros de dívidas", dinheiro(p.juros)]] : []),
          ]}
        />
        <Text style={s.aviso}>Guias de impostos pagas contam só no caixa: o lucro já desconta o imposto estimado. Da parcela de uma dívida, só os juros são despesa.</Text>

        {r.folha.length > 0 && (
          <View wrap={false}>
            <Text style={s.secao}>Funcionários</Text>
            <Tabela
              colunas={[{ titulo: "Nome", largura: 34 }, { titulo: "Dias", largura: 8, direita: true }, { titulo: "Salário", largura: 18, direita: true }, { titulo: "Custo total", largura: 20, direita: true }, { titulo: "Pago no mês", largura: 20, direita: true }]}
              linhas={r.folha.map(({ linha: l, nome }) => [nome, String(l.diasTrabalhados), dinheiro(l.salario), dinheiro(l.custoTotal), l.status === "pago" ? dinheiro(l.valorCaixa) : "A pagar"])}
              total={["Total", "", dinheiro(r.folha.reduce((t, f) => t + f.linha.salario, 0)), dinheiro(p.folha), ""]}
            />
            {r.provisoesPagas.map((pg, i) => (
              <Text key={i} style={{ marginTop: 3 }}>
                {pg.tipo === "ferias" ? "Férias" : "13º"} de {pg.nome} pago em {formatarData(pg.pagoEm)}: {dinheiro(pg.valor)} (só caixa)
              </Text>
            ))}
          </View>
        )}

        {r.dividas.length > 0 && (
          <View wrap={false}>
            <Text style={s.secao}>Dívidas</Text>
            <Tabela
              colunas={[{ titulo: "Credor", largura: 30 }, { titulo: "Tipo", largura: 16 }, { titulo: "Parcela do mês", largura: 14, direita: true }, { titulo: "Juros", largura: 12, direita: true }, { titulo: "Saldo devedor", largura: 16, direita: true }, { titulo: "Termina", largura: 12, direita: true }]}
              linhas={r.dividas.map((d) => {
                const parcela = r.parcelas.find((x) => x.parcela.dividaId === d.id)?.parcela;
                return [d.credor, NOME_TIPO_DIVIDA[d.tipo], parcela ? dinheiro(parcela.valor) : "-", parcela ? dinheiro(parcela.juros) : "-", dinheiro(d.saldoDevedor), d.terminaEm ? formatarData(d.terminaEm) : ""];
              })}
            />
          </View>
        )}

        <Text style={s.secao} break>
          Vendas do mês ({r.vendas.length})
        </Text>
        <Tabela
          colunas={[{ titulo: "Data", largura: 11 }, { titulo: "Descrição", largura: 35 }, { titulo: "Fonte", largura: 18 }, { titulo: "Forma", largura: 12 }, { titulo: "Situação", largura: 10 }, { titulo: "Valor", largura: 14, direita: true }]}
          linhas={r.vendas.map((v) => [formatarData(v.data), v.descricao, v.fonte, NOME_FORMA[v.forma as keyof typeof NOME_FORMA], STATUS[v.status], dinheiro(v.valor)])}
          total={["", "Total", "", "", "", dinheiro(p.faturamento)]}
        />

        <Text style={s.secao}>Despesas lançadas ({r.despesas.length})</Text>
        <Tabela
          colunas={[{ titulo: "Data", largura: 11 }, { titulo: "Descrição", largura: 33 }, { titulo: "Categoria", largura: 22 }, { titulo: "Situação", largura: 20 }, { titulo: "Valor", largura: 14, direita: true }]}
          linhas={r.despesas.map((d) => [formatarData(d.data), d.descricao, d.categoria, d.status === "pago" && d.pagoEm ? `Pago ${formatarData(d.pagoEm)}` : `Vence ${formatarData(d.vencimento)}`, dinheiro(d.valor)])}
        />

        <View style={s.rodape} fixed>
          <Text>Gerado por urutau gestão em {formatarData(r.geradoEm)} · Valores de impostos são estimados: confirme com o seu contador.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function gerarPdf(r: Relatorio): Promise<Buffer> {
  return renderToBuffer(<RelatorioPdf r={r} />);
}
