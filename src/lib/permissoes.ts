import type { Papel } from "@/db/schema";

/**
 * - ver_painel: números consolidados da empresa (lucro, caixa…)
 * - lancar: criar/editar vendas e despesas (colaborador só as próprias)
 * - ver_lancamentos: ver listas de vendas e despesas
 * - gerenciar: empresa, categorias, fontes e usuários
 * - conferir: dar o check final no que entrou sozinho (WhatsApp, agenda…)
 * - ver_clientes: lista de clientes (cadastrar e editar exige também "lancar")
 */
export type Acao =
  | "ver_painel"
  | "lancar"
  | "ver_lancamentos"
  | "ver_todos_lancamentos"
  | "gerenciar"
  | "conferir"
  | "ver_clientes";

const MATRIZ: Record<Papel, ReadonlySet<Acao>> = {
  dono: new Set(["ver_painel", "lancar", "ver_lancamentos", "ver_todos_lancamentos", "gerenciar", "conferir", "ver_clientes"]),
  colaborador: new Set(["lancar", "ver_lancamentos", "ver_clientes"]),
  contador: new Set(["ver_painel", "ver_lancamentos", "ver_todos_lancamentos", "ver_clientes"]),
};

export function pode(papel: Papel, acao: Acao): boolean {
  return MATRIZ[papel].has(acao);
}

/** Colaborador só altera o que ele mesmo lançou; dono altera tudo; contador nada. */
export function podeAlterarLancamento(papel: Papel, usuarioId: string, criadoPor: string | null): boolean {
  if (papel === "dono") return true;
  if (papel === "colaborador") return criadoPor === usuarioId;
  return false;
}

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  colaborador: "Colaborador",
  contador: "Contador",
};
