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
    };
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
