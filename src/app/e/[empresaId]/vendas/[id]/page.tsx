import { notFound } from "next/navigation";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormVenda } from "@/components/FormVenda";
import { formatarData, mesDe } from "@/lib/datas";
import { centavosParaInput } from "@/lib/dinheiro";
import { podeAlterarLancamento } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { excluirVenda, salvarVenda } from "@/lib/servidor/acoes-lancamentos";
import { listarFontes, obterVenda } from "@/lib/servidor/lancamentos";
import { opcoesDeClientes } from "@/lib/servidor/clientes";
import { obterDb } from "@/db";
import { NOME_ORIGEM_VENDA } from "@/lib/rotulos";

export const metadata = { title: "Venda" };

export default async function EditarVenda({ params }: { params: Promise<{ empresaId: string; id: string }> }) {
  const { empresaId, id } = await params;
  const ctx = await exigirAcesso(empresaId, "ver_lancamentos");
  const venda = /^[0-9a-f-]{36}$/i.test(id) ? await obterVenda(ctx, id) : null;
  if (!venda) notFound();
  // Mostra também a fonte atual mesmo que tenha sido desativada.
  const fontes = (await listarFontes(empresaId, false)).filter((f) => f.ativo || f.id === venda.fonteReceitaId);
  const clientes = await opcoesDeClientes(obterDb(), empresaId);
  const editavel = podeAlterarLancamento(ctx.papel, ctx.usuario.id, venda.criadoPor);
  return (
    <>
      <Cabecalho titulo={editavel ? "Editar venda" : "Venda"} voltar={`/e/${empresaId}/vendas?mes=${mesDe(venda.data)}`} />
      {venda.origem !== "manual" && (
        <p className="mb-4 rounded-xl border border-borda p-3 text-sm text-suave">
          Entrou {NOME_ORIGEM_VENDA[venda.origem]}
          {venda.conferidoEm ? `, conferida em ${formatarData(venda.conferidoEm.toISOString().slice(0, 10))}.` : ". Ainda não foi conferida."}
        </p>
      )}
      <FormVenda
        acao={salvarVenda.bind(null, empresaId, id)}
        fontes={fontes}
        clientes={clientes}
        somenteLeitura={!editavel}
        inicial={{
          data: venda.data,
          valor: centavosParaInput(venda.valorCentavos),
          descricao: venda.descricao,
          fonteReceitaId: venda.fonteReceitaId,
          formaPagamento: venda.formaPagamento,
          status: venda.status,
          dataRecebimento: venda.dataRecebimento,
          clienteId: venda.clienteId ?? "",
        }}
      />
      {editavel && (
        <div className="mt-6">
          <BotaoAcao acao={excluirVenda.bind(null, empresaId, id)} className="btn-perigo w-full" confirmar="Excluir esta venda?">
            Excluir venda
          </BotaoAcao>
        </div>
      )}
    </>
  );
}
