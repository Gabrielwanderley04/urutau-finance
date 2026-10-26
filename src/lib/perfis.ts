import type { Atividade, Modulo, Perfil } from "@/db/schema";

/**
 * Cada tipo de negócio vê o urutau de um jeito: módulos ligados por padrão, tela inicial
 * e fontes de receita sugeridas. Os módulos que ainda não têm tela (agenda, estoque, WhatsApp)
 * já ficam registrados, para o painel Urutau e as próximas fases.
 */
export interface DefinicaoPerfil {
  nome: string;
  descricao: string;
  modulos: readonly Modulo[];
  /** Fontes de receita criadas com a empresa; null = usa as padrão da atividade. */
  fontes: { nome: string; natureza: "comercio" | "servico" }[] | null;
  atividadeSugerida: Atividade;
}

export const PERFIS: Record<Perfil, DefinicaoPerfil> = {
  financas: {
    nome: "Só finanças",
    descricao: "Painel de lucro, caixa, impostos e contas.",
    modulos: ["financas"],
    fontes: null,
    atividadeSugerida: "comercio",
  },
  revenda_veiculos: {
    nome: "Revenda de veículos",
    descricao: "Estoque de carros, visitas e test drive marcados pelo WhatsApp, comissões de financiamento.",
    modulos: ["financas", "agenda", "estoque", "whatsapp"],
    fontes: [
      { nome: "Venda de veículos", natureza: "comercio" },
      { nome: "Comissão de financiamento", natureza: "servico" },
      { nome: "Despachante e documentação", natureza: "servico" },
    ],
    atividadeSugerida: "ambos",
  },
  consultorio: {
    nome: "Consultório",
    descricao: "Agenda de atendimentos em primeiro lugar, sessões e pacotes.",
    modulos: ["financas", "agenda", "whatsapp"],
    fontes: [
      { nome: "Sessões", natureza: "servico" },
      { nome: "Pacotes", natureza: "servico" },
    ],
    atividadeSugerida: "servicos",
  },
  varejo: {
    nome: "Varejo",
    descricao: "Balcão, estoque e vendas pelo WhatsApp.",
    modulos: ["financas", "estoque", "whatsapp"],
    fontes: [
      { nome: "Loja física", natureza: "comercio" },
      { nome: "WhatsApp", natureza: "comercio" },
      { nome: "Site", natureza: "comercio" },
    ],
    atividadeSugerida: "comercio",
  },
  servicos: {
    nome: "Serviço com visita",
    descricao: "Visitas e orçamentos agendados.",
    modulos: ["financas", "agenda", "whatsapp"],
    fontes: [{ nome: "Serviços", natureza: "servico" }],
    atividadeSugerida: "servicos",
  },
  alimentacao: {
    nome: "Alimentação",
    descricao: "Pedidos do dia e caixa.",
    modulos: ["financas", "estoque", "whatsapp"],
    fontes: [
      { nome: "Balcão", natureza: "comercio" },
      { nome: "Delivery", natureza: "comercio" },
      { nome: "WhatsApp", natureza: "comercio" },
    ],
    atividadeSugerida: "comercio",
  },
};

export const ORDEM_PERFIS: Perfil[] = ["revenda_veiculos", "consultorio", "varejo", "servicos", "alimentacao", "financas"];

export const NOME_MODULO: Record<Modulo, string> = {
  financas: "Finanças",
  agenda: "Agenda",
  estoque: "Estoque",
  whatsapp: "Atendente no WhatsApp",
};

export const TODOS_MODULOS: Modulo[] = ["financas", "agenda", "estoque", "whatsapp"];

/** Como cada módulo se chama no menu, no vocabulário do negócio. */
export function telaDoModulo(perfil: Perfil, modulo: Exclude<Modulo, "financas">): { titulo: string; desc: string } {
  const veiculos = perfil === "revenda_veiculos";
  const consultorio = perfil === "consultorio";
  if (modulo === "agenda")
    return veiculos
      ? { titulo: "Visitas e test drive", desc: "Horários marcados pelo atendente e pela equipe" }
      : { titulo: "Agenda", desc: consultorio ? "Atendimentos do dia e horários livres" : "Horários marcados" };
  if (modulo === "estoque")
    return veiculos
      ? { titulo: "Estoque de veículos", desc: "Carros disponíveis, reservados e vendidos" }
      : { titulo: "Estoque", desc: "Produtos, entradas e baixas" };
  return { titulo: "Atendente no WhatsApp", desc: "Conversas, regras de atendimento e passar para humano" };
}

/**
 * O que gravar em empresa_modulos para que os ligados sejam exatamente `marcados`:
 * só as diferenças em relação ao perfil (assim, mudar o perfil depois traz os novos padrões).
 */
export function escolhasParaGravar(perfil: Perfil, marcados: ReadonlySet<Modulo>): { modulo: Modulo; ativo: boolean }[] {
  const padrao = new Set(PERFIS[perfil].modulos);
  return TODOS_MODULOS.filter((m) => m !== "financas" && marcados.has(m) !== padrao.has(m)).map((m) => ({ modulo: m, ativo: marcados.has(m) }));
}

/** Módulos ligados: o padrão do perfil, com as escolhas feitas no painel Urutau por cima. */
export function modulosAtivos(perfil: Perfil, escolhas: { modulo: Modulo; ativo: boolean }[]): Set<Modulo> {
  const ativos = new Set<Modulo>(PERFIS[perfil].modulos);
  for (const e of escolhas) {
    if (e.ativo) ativos.add(e.modulo);
    else ativos.delete(e.modulo);
  }
  // Finanças é a base: as vendas de todos os outros módulos caem nela.
  ativos.add("financas");
  return ativos;
}
