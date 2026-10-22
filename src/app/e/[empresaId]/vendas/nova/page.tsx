import { Cabecalho } from "@/components/Campos";
import { FormVenda } from "@/components/FormVenda";
import { hoje } from "@/lib/datas";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarVenda } from "@/lib/servidor/acoes-lancamentos";
import { listarFontes } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Nova venda" };

export default async function NovaVenda({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "lancar");
  const fontes = await listarFontes(empresaId);
  const d = hoje();
  return (
    <>
      <Cabecalho titulo="Nova venda" voltar={`/e/${empresaId}/vendas`} />
      <FormVenda
        acao={salvarVenda.bind(null, empresaId, null)}
        fontes={fontes}
        inicial={{ data: d, valor: "", descricao: "", fonteReceitaId: fontes[0]?.id ?? "", formaPagamento: "pix", status: "recebido", dataRecebimento: "" }}
      />
    </>
  );
}
