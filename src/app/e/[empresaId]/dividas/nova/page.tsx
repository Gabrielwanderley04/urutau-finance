import { Cabecalho } from "@/components/Campos";
import { FormDivida } from "@/components/FormDivida";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { criarDivida } from "@/lib/servidor/acoes-dividas";

export const metadata = { title: "Nova dívida" };

export default async function NovaDivida({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  return (
    <>
      <Cabecalho titulo="Nova dívida" voltar={`/e/${empresaId}/dividas`} />
      <p className="mb-5 text-sm text-suave">Com os dados do contrato, geramos todas as parcelas como contas a pagar, separando juros e amortização.</p>
      <FormDivida acao={criarDivida.bind(null, empresaId)} />
    </>
  );
}
