import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormDespesa } from "@/components/FormDespesa";
import { mesDe } from "@/lib/datas";
import { centavosParaInput } from "@/lib/dinheiro";
import { podeAlterarLancamento } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { excluirDespesa, salvarDespesa } from "@/lib/servidor/acoes-lancamentos";
import { listarCategorias, obterDespesa } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Despesa" };

export default async function EditarDespesa({ params }: { params: Promise<{ empresaId: string; id: string }> }) {
  const { empresaId, id } = await params;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await obterDespesa(ctx, id) : null;
  if (!d) notFound();
  const categorias = (await listarCategorias(empresaId, false)).filter((c) => c.ativo || c.id === d.categoriaId);
  const editavel = podeAlterarLancamento(ctx.papel, ctx.usuario.id, d.criadoPor);
  return (
    <>
      <Cabecalho titulo={editavel ? "Editar despesa" : "Despesa"} voltar={`/e/${empresaId}/despesas?mes=${mesDe(d.data)}`} />
      <FormDespesa
        acao={salvarDespesa.bind(null, empresaId, id)}
        categorias={categorias}
        somenteLeitura={!editavel}
        inicial={{
          data: d.data,
          valor: centavosParaInput(d.valorCentavos),
          descricao: d.descricao,
          categoriaId: d.categoriaId,
          status: d.status,
          vencimento: d.vencimento,
          pagoEm: d.pagoEm ?? "",
        }}
      />
      {editavel && (
        <div className="mt-6">
          <BotaoAcao acao={excluirDespesa.bind(null, empresaId, id)} className="btn-perigo w-full" confirmar="Excluir esta despesa?">
            Excluir despesa
          </BotaoAcao>
        </div>
      )}
    </>
  );
}
