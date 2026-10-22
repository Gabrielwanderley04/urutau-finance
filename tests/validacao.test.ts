import { describe, expect, it } from "vitest";
import { cnpjValido, esquemaDespesa, esquemaEmpresa, esquemaVenda } from "@/lib/validacao";
import { pode, podeAlterarLancamento } from "@/lib/permissoes";

const FONTE = "6f1c1f1e-9d3a-4a43-9a51-1a2b3c4d5e6f";

describe("CNPJ", () => {
  it("aceita CNPJ válido com ou sem máscara", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000181")).toBe(true);
  });
  it("rejeita dígito errado e repetidos", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });
});

describe("venda", () => {
  const ok = { data: "2026-10-05", valor: "150,00", descricao: "", fonteReceitaId: FONTE, formaPagamento: "pix", status: "recebido" };
  it("recebido sem data de recebimento usa a data da venda", () => {
    const v = esquemaVenda.parse(ok);
    expect(v.valor).toBe(15_000);
    expect(v.dataRecebimento).toBe("2026-10-05");
  });
  it("a receber exige data prevista", () => {
    const r = esquemaVenda.safeParse({ ...ok, status: "a_receber" });
    expect(r.success).toBe(false);
  });
  it("valor zero ou inválido é recusado", () => {
    expect(esquemaVenda.safeParse({ ...ok, valor: "0" }).success).toBe(false);
    expect(esquemaVenda.safeParse({ ...ok, valor: "dez" }).success).toBe(false);
  });
});

describe("despesa", () => {
  const ok = { data: "2026-10-05", valor: "1.800", descricao: "Aluguel", categoriaId: FONTE, status: "a_pagar", vencimento: "2026-10-10" };
  it("a pagar não tem data de pagamento", () => {
    expect(esquemaDespesa.parse(ok).pagoEm).toBeNull();
  });
  it("paga sem data assume o vencimento", () => {
    expect(esquemaDespesa.parse({ ...ok, status: "pago" }).pagoEm).toBe("2026-10-10");
  });
});

describe("empresa", () => {
  const base = { nome: "Café Teste", atividade: "ambos", regime: "simples", anexoComercio: "I", anexoServicos: "V", sujeitoFatorR: "on" };
  it("Simples com comércio e serviço exige os dois anexos", () => {
    expect(esquemaEmpresa.safeParse({ ...base, anexoServicos: "" }).success).toBe(false);
    expect(esquemaEmpresa.parse(base)).toMatchObject({ anexoComercio: "I", anexoServicos: "V", sujeitoFatorR: true });
  });
  it("Fator R é ignorado no Anexo IV e fora do Simples", () => {
    expect(esquemaEmpresa.parse({ ...base, anexoServicos: "IV" }).sujeitoFatorR).toBe(false);
    expect(esquemaEmpresa.parse({ ...base, regime: "mei" })).toMatchObject({ anexoComercio: null, anexoServicos: null, sujeitoFatorR: false });
  });
});

describe("papéis", () => {
  it("contador só lê", () => {
    expect(pode("contador", "ver_painel")).toBe(true);
    expect(pode("contador", "lancar")).toBe(false);
    expect(podeAlterarLancamento("contador", "u1", "u1")).toBe(false);
  });
  it("colaborador lança, mas não vê o painel nem altera lançamento dos outros", () => {
    expect(pode("colaborador", "lancar")).toBe(true);
    expect(pode("colaborador", "ver_painel")).toBe(false);
    expect(pode("colaborador", "gerenciar")).toBe(false);
    expect(podeAlterarLancamento("colaborador", "u1", "u2")).toBe(false);
    expect(podeAlterarLancamento("colaborador", "u1", "u1")).toBe(true);
  });
  it("dono faz tudo", () => {
    expect(pode("dono", "gerenciar")).toBe(true);
    expect(podeAlterarLancamento("dono", "u1", "u2")).toBe(true);
  });
});
