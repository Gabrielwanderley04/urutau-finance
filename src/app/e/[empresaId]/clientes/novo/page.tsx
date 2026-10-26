import { Cabecalho } from "@/components/Campos";
import { FormCliente } from "@/components/FormCliente";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarCliente } from "@/lib/servidor/acoes-clientes";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "lancar");
  return (
    <>
      <Cabecalho titulo="Novo cliente" voltar={`/e/${empresaId}/clientes`} />
      <FormCliente acao={salvarCliente.bind(null, empresaId, null)} inicial={{ nome: "", telefone: "", email: "", documento: "", observacao: "" }} />
    </>
  );
}
