import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormItemSimples } from "@/components/FormItemSimples";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { alternarCategoria, excluirCategoria, salvarCategoria } from "@/lib/servidor/acoes-ajustes";
import { contarUsoCategorias, listarCategorias } from "@/lib/servidor/lancamentos";

export const metadata = { title: "Categorias de despesa" };

const OPCOES = [
  { v: "fixo", nome: "Fixa" },
  { v: "variavel", nome: "Variável" },
];

export default async function Categorias({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "gerenciar");
  const [lista, uso] = await Promise.all([listarCategorias(empresaId, false), contarUsoCategorias(empresaId)]);
  return (
    <>
      <Cabecalho titulo="Categorias" voltar={`/e/${empresaId}/mais`} />
      <p className="mb-4 text-sm text-suave">
        <strong className="text-texto">Fixa</strong>: não muda com as vendas (aluguel, salários).{" "}
        <strong className="text-texto">Variável</strong>: cresce junto com as vendas (mercadorias, embalagens, comissões). Isso define o ponto de equilíbrio.
      </p>
      <ul className="space-y-3">
        {lista.map((c) => (
          <li key={c.id} className={`cartao space-y-2 ${c.ativo ? "" : "opacity-60"}`}>
            <FormItemSimples
              acao={salvarCategoria.bind(null, empresaId, c.id)}
              nome={c.nome}
              campoSelect="comportamento"
              opcoes={OPCOES}
              valorSelect={c.comportamento}
              textoBotao="Salvar"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-suave">
              <span>{uso.get(c.id) ?? 0} lançamentos</span>
              {!c.entraNoLucro && <span>Conta só no caixa</span>}
              {c.chaveSistema && <span>Categoria padrão</span>}
              <BotaoAcao acao={alternarCategoria.bind(null, empresaId, c.id, !c.ativo)} className="underline">
                {c.ativo ? "Desativar" : "Reativar"}
              </BotaoAcao>
              {!c.chaveSistema && !uso.get(c.id) && (
                <BotaoAcao acao={excluirCategoria.bind(null, empresaId, c.id)} className="text-negativo underline" confirmar={`Excluir "${c.nome}"?`}>
                  Excluir
                </BotaoAcao>
              )}
            </div>
          </li>
        ))}
      </ul>
      <section className="cartao mt-5">
        <h2 className="mb-2 font-titulo font-bold">Nova categoria</h2>
        <FormItemSimples acao={salvarCategoria.bind(null, empresaId, null)} campoSelect="comportamento" opcoes={OPCOES} textoBotao="Criar" placeholder="Ex.: Embalagens" />
      </section>
    </>
  );
}
