import type { BancoDeDados } from "./index";
import { PERFIS } from "@/lib/perfis";
import { categoriasDespesa, fontesReceita, type Atividade, type ChaveCategoria, type Perfil } from "./schema";

type Tx = Parameters<Parameters<BancoDeDados["transaction"]>[0]>[0];

export const CATEGORIAS_PADRAO: {
  chave: ChaveCategoria;
  nome: string;
  comportamento: "fixo" | "variavel";
  entraNoLucro: boolean;
  entraNaFolhaFatorR: boolean;
}[] = [
  { chave: "contas_fixas", nome: "Contas fixas", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: false },
  { chave: "funcionarios", nome: "Funcionários", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: true },
  { chave: "mercadorias", nome: "Produtos e mercadorias", comportamento: "variavel", entraNoLucro: true, entraNaFolhaFatorR: false },
  // O lucro já desconta o imposto estimado; o pagamento da guia (DAS, ISS…) só mexe no caixa.
  { chave: "impostos", nome: "Impostos sobre vendas", comportamento: "variavel", entraNoLucro: false, entraNaFolhaFatorR: false },
  { chave: "pro_labore", nome: "Pró-labore dos sócios", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: true },
  { chave: "marketing", nome: "Marketing", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: false },
  { chave: "juros_tarifas", nome: "Juros e tarifas", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: false },
  { chave: "outras", nome: "Outras", comportamento: "fixo", entraNoLucro: true, entraNaFolhaFatorR: false },
];

export function fontesPadrao(atividade: Atividade) {
  const comercio = [
    { nome: "Loja física", natureza: "comercio" as const },
    { nome: "Site", natureza: "comercio" as const },
    { nome: "Delivery", natureza: "comercio" as const },
  ];
  const servicos = [{ nome: "Serviços", natureza: "servico" as const }];
  if (atividade === "comercio") return comercio;
  if (atividade === "servicos") return servicos;
  return [...comercio, ...servicos];
}

export async function criarPadroesDaEmpresa(tx: Tx, empresaId: string, atividade: Atividade, perfil: Perfil = "financas") {
  await tx.insert(categoriasDespesa).values(
    CATEGORIAS_PADRAO.map((c, i) => ({
      empresaId,
      nome: c.nome,
      chaveSistema: c.chave,
      comportamento: c.comportamento,
      entraNoLucro: c.entraNoLucro,
      entraNaFolhaFatorR: c.entraNaFolhaFatorR,
      ordem: i,
    })),
  );
  await tx
    .insert(fontesReceita)
    .values((PERFIS[perfil].fontes ?? fontesPadrao(atividade)).map((f, i) => ({ empresaId, ...f, ordem: i })));
}
