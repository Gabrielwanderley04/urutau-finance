import type { TipoDivida } from "@/db/schema";

export const NOME_TIPO_DIVIDA: Record<TipoDivida, string> = {
  emprestimo: "Empréstimo",
  financiamento: "Financiamento",
  fornecedor: "Fornecedor",
  imposto_parcelado: "Imposto parcelado",
  cartao: "Cartão de crédito",
  outro: "Outro",
};
