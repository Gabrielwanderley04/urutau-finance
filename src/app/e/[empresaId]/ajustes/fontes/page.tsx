import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormItemSimples } from "@/components/FormItemSimples";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { alternarFonte, excluirFonte, salvarFonte } from "@/lib/servidor/acoes-ajustes";
import { contarUsoFontes, listarFontes } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Fontes de receita" };

const OPCOES = [
  { v: "comercio", nome: "Venda de produto" },
  { v: "servico", nome: "Serviço" },
];

export default async function Fontes({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  const [lista, uso] = await Promise.all([listarFontes(empresaId, false), contarUsoFontes(empresaId)]);
  return (
    <>
      <Cabecalho titulo="Fontes de receita" voltar={`/e/${empresaId}/mais`} />
      <p className="mb-4 text-sm text-suave">
        Diga se cada fonte vende <strong className="text-texto">produto</strong> ou <strong className="text-texto">serviço</strong>: os impostos são diferentes para cada um.
      </p>
      <ul className="space-y-3">
        {lista.map((f) => (
          <li key={f.id} className={`cartao space-y-2 ${f.ativo ? "" : "opacity-60"}`}>
            <FormItemSimples acao={salvarFonte.bind(null, empresaId, f.id)} nome={f.nome} campoSelect="natureza" opcoes={OPCOES} valorSelect={f.natureza} textoBotao="Salvar" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
              <span>{uso.get(f.id) ?? 0} vendas</span>
              <BotaoAcao acao={alternarFonte.bind(null, empresaId, f.id, !f.ativo)} className="underline">
                {f.ativo ? "Desativar" : "Reativar"}
              </BotaoAcao>
              {!uso.get(f.id) && (
                <BotaoAcao acao={excluirFonte.bind(null, empresaId, f.id)} className="text-negativo underline" confirmar={`Excluir "${f.nome}"?`}>
                  Excluir
                </BotaoAcao>
              )}
            </div>
          </li>
        ))}
      </ul>
      <section className="cartao mt-5">
        <h2 className="mb-2 font-titulo font-bold">Nova fonte</h2>
        <FormItemSimples acao={salvarFonte.bind(null, empresaId, null)} campoSelect="natureza" opcoes={OPCOES} textoBotao="Criar" placeholder="Ex.: iFood" />
      </section>
    </>
  );
}
