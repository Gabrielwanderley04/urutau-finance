import { Cabecalho } from "@/components/Campos";
import { FormRecorrente } from "@/components/FormRecorrente";
import { mesAtual } from "@/lib/datas";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarRecorrente } from "@/lib/servidor/acoes-fase4";
import { listarCategorias } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Nova despesa recorrente" };

export default async function NovaRecorrente({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  const categorias = await listarCategorias(empresaId);
  return (
    <>
      <Cabecalho titulo="Nova recorrente" voltar={`/e/${empresaId}/despesas/recorrentes`} />
      <FormRecorrente
        acao={salvarRecorrente.bind(null, empresaId, null)}
        categorias={categorias}
        textoBotao="Criar"
        inicial={{ descricao: "", valor: "", categoriaId: categorias.find((c) => c.chaveSistema === "contas_fixas")?.id ?? "", diaVencimento: "10", inicio: mesAtual(), fim: "" }}
      />
    </>
  );
}
