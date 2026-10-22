import { Cabecalho } from "@/components/Campos";
import { FormDespesa } from "@/components/FormDespesa";
import { hoje } from "@/lib/datas";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarDespesa } from "@/lib/servidor/acoes-lancamentos";
import { listarCategorias } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Nova despesa" };

export default async function NovaDespesa({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "lancar");
  const categorias = await listarCategorias(empresaId);
  const d = hoje();
  return (
    <>
      <Cabecalho titulo="Nova despesa" voltar={`/e/${empresaId}/despesas`} />
      <FormDespesa
        acao={salvarDespesa.bind(null, empresaId, null)}
        categorias={categorias}
        inicial={{ data: d, valor: "", descricao: "", categoriaId: "", status: "pago", vencimento: d, pagoEm: "" }}
      />
    </>
  );
}
