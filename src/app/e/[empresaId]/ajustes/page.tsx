import { Cabecalho } from "@/components/Campos";
import { FormEmpresa } from "@/components/FormEmpresa";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { atualizarEmpresa } from "@/lib/servidor/empresas";

export const metadata = { title: "Dados da empresa" };

export default async function AjustesEmpresa({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa } = await exigirAcesso(empresaId, "gerenciar");
  return (
    <>
      <Cabecalho titulo="Dados da empresa" voltar={`/e/${empresaId}/mais`} />
      <FormEmpresa acao={atualizarEmpresa.bind(null, empresaId)} empresa={empresa} textoBotao="Salvar" />
    </>
  );
}
