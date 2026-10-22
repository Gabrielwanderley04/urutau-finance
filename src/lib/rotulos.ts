import type { FormaPagamento } from "@/db/schema";

export const FORMAS_PAGAMENTO: { v: FormaPagamento; nome: string }[] = [
  { v: "pix", nome: "Pix" },
  { v: "dinheiro", nome: "Dinheiro" },
  { v: "debito", nome: "Débito" },
  { v: "credito", nome: "Crédito" },
  { v: "boleto", nome: "Boleto" },
  { v: "transferencia", nome: "Transferência" },
  { v: "outro", nome: "Outro" },
];

export const NOME_FORMA = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.v, f.nome])) as Record<FormaPagamento, string>;
