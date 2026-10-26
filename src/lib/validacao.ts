import { z } from "zod";
import { dataValida } from "@/lib/datas";
import { lerPercentual, lerReais } from "@/lib/dinheiro";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export function somenteDigitos(s: string) {
  return s.replace(/\D/g, "");
}

export function cnpjValido(entrada: string): boolean {
  const c = somenteDigitos(entrada);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/**
 * Telefone no formato do WhatsApp: só dígitos, com DDI. Número brasileiro sem DDI
 * (10 ou 11 dígitos com DDD) ganha o 55; com "+" na frente, o DDI já veio.
 * Devolve null se não parecer um telefone.
 */
export function normalizarTelefone(entrada: string): string | null {
  const comDdi = entrada.trim().startsWith("+");
  let d = somenteDigitos(entrada).replace(/^0+/, "");
  if (!comDdi && (d.length === 10 || d.length === 11)) d = `55${d}`;
  // Fora do Brasil o número completo pode ter só 10 ou 11 dígitos (ex.: EUA, +1 e 10 dígitos).
  if (d.length < (comDdi ? 10 : 12) || d.length > 15) return null;
  if (d.startsWith("55") && d.length !== 12 && d.length !== 13) return null;
  return d;
}

export function formatarTelefone(t: string | null) {
  if (!t) return "";
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(t);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${t}`;
}

export function formatarCnpj(c: string | null) {
  if (!c) return "";
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

const texto = (max = 200) => z.string({ message: "Campo obrigatório" }).trim().max(max, `Use no máximo ${max} caracteres`);
const data = (msg = "Informe uma data válida") => z.string({ message: msg }).refine((d) => dataValida(d), msg);
const dataOpcional = z
  .string()
  .optional()
  .transform((d) => (d ? d : undefined))
  .refine((d) => d === undefined || dataValida(d), "Informe uma data válida");
const uuid = (msg: string) => z.string({ message: msg }).uuid(msg);

export const valorEmReais = z
  .string({ message: "Informe o valor" })
  .transform((s, ctx) => {
    const c = lerReais(s);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 1.250,90" });
      return z.NEVER;
    }
    return c;
  })
  .refine((c) => c > 0, "O valor precisa ser maior que zero")
  .refine((c) => c <= 100_000_000_000, "Valor muito alto. Confira os dígitos.");

const percentualOpcional = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    const p = lerPercentual(s);
    if (p === null || p > 100_000) {
      ctx.addIssue({ code: "custom", message: "Percentual inválido. Exemplo: 5 ou 2,5" });
      return z.NEVER;
    }
    return p;
  });

export const esquemaVenda = z
  .object({
    data: data(),
    valor: valorEmReais,
    descricao: texto(),
    fonteReceitaId: uuid("Escolha de onde veio a venda"),
    formaPagamento: z.enum(["dinheiro", "pix", "debito", "credito", "boleto", "transferencia", "outro"], {
      message: "Escolha a forma de pagamento",
    }),
    status: z.enum(["recebido", "a_receber"], { message: "Diga se já recebeu" }),
    dataRecebimento: dataOpcional,
    clienteId: z
      .string()
      .optional()
      .transform((s) => s || null)
      .refine((s) => s === null || z.string().uuid().safeParse(s).success, "Cliente inválido"),
  })
  .transform((v, ctx) => {
    let dataRecebimento = v.dataRecebimento;
    if (!dataRecebimento) {
      if (v.status === "a_receber") {
        ctx.addIssue({ code: "custom", path: ["dataRecebimento"], message: "Quando você vai receber?" });
        return z.NEVER;
      }
      dataRecebimento = v.data;
    }
    return { ...v, dataRecebimento };
  });

export const esquemaDespesa = z
  .object({
    data: data(),
    valor: valorEmReais,
    descricao: texto(),
    categoriaId: uuid("Escolha uma categoria"),
    status: z.enum(["pago", "a_pagar"], { message: "Diga se já pagou" }),
    vencimento: dataOpcional,
    pagoEm: dataOpcional,
  })
  .transform((v) => {
    const vencimento = v.vencimento ?? v.data;
    const pagoEm = v.status === "pago" ? (v.pagoEm ?? vencimento) : null;
    return { ...v, vencimento, pagoEm };
  });

export const esquemaEmpresa = z
  .object({
    nome: texto(120).min(2, "Informe o nome da empresa"),
    cnpj: z
      .string()
      .optional()
      .transform((s) => (s ? somenteDigitos(s) : ""))
      .refine((s) => s === "" || cnpjValido(s), "CNPJ inválido. Confira os números.")
      .transform((s) => (s === "" ? null : s)),
    atividade: z.enum(["comercio", "servicos", "ambos"], { message: "Escolha a atividade" }),
    cidade: texto(80).optional().transform((s) => s || null),
    uf: z
      .string()
      .optional()
      .transform((s) => (s ? s.toUpperCase() : null))
      .refine((s) => s === null || (UFS as readonly string[]).includes(s), "UF inválida"),
    regime: z.enum(["mei", "simples", "presumido", "real"], { message: "Escolha o regime tributário" }),
    anexoComercio: z.enum(["I", "II"]).optional().or(z.literal("")),
    anexoServicos: z.enum(["III", "IV", "V"]).optional().or(z.literal("")),
    sujeitoFatorR: z.string().optional(),
    aliquotaIss: percentualOpcional,
    aliquotaIcms: percentualOpcional,
    inicioAtividade: dataOpcional,
    perfil: z
      .enum(["financas", "revenda_veiculos", "consultorio", "varejo", "servicos", "alimentacao"], { message: "Escolha o tipo de negócio" })
      .optional()
      .default("financas"),
  })
  .transform((v, ctx) => {
    const temComercio = v.atividade !== "servicos";
    const temServicos = v.atividade !== "comercio";
    const simples = v.regime === "simples";
    const anexoComercio = simples && temComercio ? v.anexoComercio || null : null;
    const anexoServicos = simples && temServicos ? v.anexoServicos || null : null;
    if (simples && temComercio && !anexoComercio)
      ctx.addIssue({ code: "custom", path: ["anexoComercio"], message: "Escolha o anexo do comércio" });
    if (simples && temServicos && !anexoServicos)
      ctx.addIssue({ code: "custom", path: ["anexoServicos"], message: "Escolha o anexo dos serviços" });
    // Fator R só faz sentido para atividades que alternam entre os Anexos III e V.
    const sujeitoFatorR = !!v.sujeitoFatorR && (anexoServicos === "III" || anexoServicos === "V");
    return {
      nome: v.nome,
      cnpj: v.cnpj,
      atividade: v.atividade,
      cidade: v.cidade,
      uf: v.uf,
      regime: v.regime,
      anexoComercio: anexoComercio as "I" | "II" | null,
      anexoServicos: anexoServicos as "III" | "IV" | "V" | null,
      sujeitoFatorR,
      aliquotaIssPcm: temServicos ? v.aliquotaIss : null,
      aliquotaIcmsPcm: temComercio ? v.aliquotaIcms : null,
      inicioAtividade: v.inicioAtividade ?? null,
      perfil: v.perfil,
    };
  });

export const esquemaCliente = z.object({
  nome: texto(120).min(2, "Informe o nome"),
  telefone: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return null;
      const t = normalizarTelefone(s);
      if (!t) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido. Exemplo: (21) 99999-8888" });
        return z.NEVER;
      }
      return t;
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((s) => s || null)
    .refine((s) => s === null || z.string().email().safeParse(s).success, "E-mail inválido"),
  documento: z
    .string()
    .optional()
    .transform((s) => (s ? somenteDigitos(s) : null))
    .refine((s) => !s || s.length === 11 || cnpjValido(s), "Informe um CPF (11 dígitos) ou CNPJ válido")
    .transform((s) => s || null),
  observacao: texto(1000).optional().transform((s) => s ?? ""),
});

export const esquemaCategoria = z.object({
  nome: texto(60).min(2, "Informe o nome"),
  comportamento: z.enum(["fixo", "variavel"]),
});

export const esquemaFonte = z.object({
  nome: texto(60).min(2, "Informe o nome"),
  natureza: z.enum(["comercio", "servico"]),
});

export const esquemaCadastro = z.object({
  nome: texto(80).min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(200),
});

export type ErrosFormulario = Record<string, string>;

/** Converte erros do Zod em { campo: "mensagem" } para mostrar ao lado de cada campo. */
export function errosPorCampo(erro: z.ZodError): ErrosFormulario {
  const saida: ErrosFormulario = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? "_");
    saida[campo] ??= issue.message;
  }
  return saida;
}

export function formParaObjeto(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

/** Valor opcional em reais: vazio vira 0; aceita zero. */
const valorOpcional = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return 0;
    const c = lerReais(s);
    if (c === null || c < 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 250,00" });
      return z.NEVER;
    }
    return c;
  });

const mesCampo = z
  .string({ message: "Informe o mês" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês");

export const esquemaFuncionario = z
  .object({
    nome: texto(100).min(2, "Informe o nome"),
    cargo: texto(80),
    salario: valorEmReais,
    admissao: data("Informe a data de admissão"),
    desligamento: dataOpcional,
    vt: valorOpcional,
    vr: valorOpcional,
    planoSaude: valorOpcional,
    outros: valorOpcional,
    folhaDesde: mesCampo,
  })
  .superRefine((v, ctx) => {
    if (v.desligamento && v.desligamento < v.admissao)
      ctx.addIssue({ code: "custom", path: ["desligamento"], message: "O desligamento não pode ser antes da admissão" });
  });

export const TIPOS_DIVIDA = ["emprestimo", "financiamento", "fornecedor", "imposto_parcelado", "cartao", "outro"] as const;

export const esquemaDivida = z.object({
  credor: texto(100).min(2, "Para quem a empresa deve?"),
  tipo: z.enum(TIPOS_DIVIDA, { message: "Escolha o tipo" }),
  valorOriginal: valorEmReais,
  juros: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || !s.trim()) return 0;
      const p = lerPercentual(s);
      if (p === null || p > 30_000) {
        ctx.addIssue({ code: "custom", message: "Juros inválidos. Exemplo: 1,99 (ao mês)" });
        return z.NEVER;
      }
      return p;
    }),
  numParcelas: z.coerce
    .number({ message: "Informe o número de parcelas" })
    .int("Número inteiro")
    .min(1, "Pelo menos 1 parcela")
    .max(600, "No máximo 600 parcelas"),
  valorParcela: valorOpcional,
  primeiroVencimento: data("Informe a data da 1ª parcela"),
  vencidasPagas: z.string().optional().transform((s) => !!s),
  observacao: texto(300).optional().transform((s) => s ?? ""),
});

export const esquemaDividaDescricao = esquemaDivida.pick({ credor: true, tipo: true, observacao: true });

export const esquemaRecorrente = z
  .object({
    descricao: texto(120).min(2, "Descreva a despesa (ex.: aluguel)"),
    valor: valorEmReais,
    categoriaId: uuid("Escolha uma categoria"),
    diaVencimento: z.coerce.number({ message: "Informe o dia" }).int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31"),
    inicio: mesCampo,
    fim: z
      .string()
      .optional()
      .transform((s) => (s ? s : null))
      .refine((s) => s === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(s), "Mês inválido"),
  })
  .superRefine((v, ctx) => {
    if (v.fim && v.fim < v.inicio) ctx.addIssue({ code: "custom", path: ["fim"], message: "O fim não pode ser antes do início" });
  });

export const esquemaPagamentoProvisao = z.object({
  tipo: z.enum(["decimo_terceiro", "ferias"], { message: "Escolha 13º ou férias" }),
  pagoEm: data("Informe a data do pagamento"),
  valor: valorEmReais,
  descricao: texto(120).optional().transform((s) => s ?? ""),
});
