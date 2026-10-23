import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/Campos";
import { FormRecorrente } from "@/components/FormRecorrente";
import { obterDb } from "@/db";
import { despesasRecorrentes } from "@/db/schema";
import { centavosParaInput } from "@/lib/dinheiro";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarRecorrente } from "@/lib/servidor/acoes-fase4";
import { listarCategorias } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Despesa recorrente" };

export default async function EditarRecorrente({ params }: { params: Promise<{ empresaId: string; id: string }> }) {
  const { empresaId, id } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r] = await obterDb().select().from(despesasRecorrentes).where(and(eq(despesasRecorrentes.id, id), eq(despesasRecorrentes.empresaId, empresaId)));
  if (!r) notFound();
  const categorias = (await listarCategorias(empresaId, false)).filter((c) => c.ativo || c.id === r.categoriaId);
  return (
    <>
      <Cabecalho titulo="Editar recorrente" voltar={`/e/${empresaId}/despesas/recorrentes`} />
      <p className="mb-4 text-sm text-suave">As mudanças valem para as contas ainda não pagas deste mês em diante. Meses anteriores ficam como estão.</p>
      <FormRecorrente
        acao={salvarRecorrente.bind(null, empresaId, id)}
        categorias={categorias}
        textoBotao="Salvar"
        inicial={{ descricao: r.descricao, valor: centavosParaInput(r.valorCentavos), categoriaId: r.categoriaId, diaVencimento: String(r.diaVencimento), inicio: r.inicio, fim: r.fim ?? "" }}
      />
    </>
  );
}
