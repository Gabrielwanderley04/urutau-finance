import type { FormaPagamento, OrigemVenda } from "@/db/schema";

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

/** Completa a frase "Entrou …". */
export const NOME_ORIGEM_VENDA: Record<OrigemVenda, string> = {
  manual: "lançada à mão",
  whatsapp: "pelo WhatsApp",
  agenda: "pela agenda",
  balcao: "pelo balcão",
  site: "pelo site",
};

export const ROTULO_ORIGEM_VENDA: Record<OrigemVenda, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  agenda: "Agenda",
  balcao: "Balcão",
  site: "Site",
};
