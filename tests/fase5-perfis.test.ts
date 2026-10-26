import { describe, expect, it } from "vitest";
import { PERFIS, escolhasParaGravar, modulosAtivos, telaDoModulo } from "@/lib/perfis";
import { pode } from "@/lib/permissoes";
import { esquemaCliente, esquemaEmpresa, formatarTelefone, normalizarTelefone } from "@/lib/validacao";

describe("telefone no formato do WhatsApp", () => {
  it("acrescenta o 55 em celular e fixo brasileiros", () => {
    expect(normalizarTelefone("(21) 99876-1234")).toBe("5521998761234");
    expect(normalizarTelefone("21 2637-8899")).toBe("552126378899");
    expect(normalizarTelefone("021998761234")).toBe("5521998761234");
  });
  it("mantém número que já tem DDI", () => {
    expect(normalizarTelefone("+55 21 99876-1234")).toBe("5521998761234");
    expect(normalizarTelefone("+1 415 555 2671")).toBe("14155552671");
  });
  it("recusa o que não é telefone", () => {
    expect(normalizarTelefone("1234")).toBeNull();
    expect(normalizarTelefone("55 21 9987")).toBeNull();
    expect(normalizarTelefone("55 21 99876-12345")).toBeNull();
  });
  it("formata para leitura", () => {
    expect(formatarTelefone("5521998761234")).toBe("(21) 99876-1234");
    expect(formatarTelefone("552126378899")).toBe("(21) 2637-8899");
    expect(formatarTelefone("14155552671")).toBe("+14155552671");
    expect(formatarTelefone(null)).toBe("");
  });
});

describe("cadastro de cliente", () => {
  it("normaliza telefone e documento, e aceita campos vazios", () => {
    const r = esquemaCliente.parse({ nome: " Rafael Moura ", telefone: "(21) 99876-1234", email: "", documento: "529.982.247-25", observacao: "" });
    expect(r).toEqual({ nome: "Rafael Moura", telefone: "5521998761234", email: null, documento: "52998224725", observacao: "" });
    expect(esquemaCliente.parse({ nome: "Ana" })).toMatchObject({ telefone: null, documento: null, email: null });
  });
  it("aponta telefone, e-mail e CNPJ inválidos", () => {
    const r = esquemaCliente.safeParse({ nome: "Ana", telefone: "123", email: "ana@", documento: "11222333000100" });
    expect(r.success).toBe(false);
    const campos = r.error!.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["telefone", "email", "documento"]));
  });
});

describe("perfis e módulos", () => {
  it("revenda de veículos liga agenda, estoque e WhatsApp e cria as fontes de uma loja de carros", () => {
    expect([...modulosAtivos("revenda_veiculos", [])].sort()).toEqual(["agenda", "estoque", "financas", "whatsapp"]);
    expect(PERFIS.revenda_veiculos.fontes!.map((f) => f.nome)).toEqual(["Venda de veículos", "Comissão de financiamento", "Despachante e documentação"]);
  });
  it("escolhas do painel Urutau sobrescrevem o padrão, mas finanças fica sempre ligado", () => {
    const m = modulosAtivos("consultorio", [
      { modulo: "whatsapp", ativo: false },
      { modulo: "estoque", ativo: true },
      { modulo: "financas", ativo: false },
    ]);
    expect([...m].sort()).toEqual(["agenda", "estoque", "financas"]);
  });
  it("grava só o que difere do perfil", () => {
    expect(escolhasParaGravar("revenda_veiculos", new Set(["financas", "agenda", "estoque", "whatsapp"]))).toEqual([]);
    expect(escolhasParaGravar("revenda_veiculos", new Set(["financas", "estoque"]))).toEqual([
      { modulo: "agenda", ativo: false },
      { modulo: "whatsapp", ativo: false },
    ]);
    expect(escolhasParaGravar("financas", new Set(["financas", "whatsapp"]))).toEqual([{ modulo: "whatsapp", ativo: true }]);
  });
  it("gravar e reler devolve exatamente o que foi marcado", () => {
    const marcados = new Set(["financas", "agenda"] as const);
    for (const perfil of Object.keys(PERFIS) as (keyof typeof PERFIS)[])
      expect([...modulosAtivos(perfil, escolhasParaGravar(perfil, marcados))].sort()).toEqual(["agenda", "financas"]);
  });
  it("o menu usa o vocabulário da revenda", () => {
    expect(telaDoModulo("revenda_veiculos", "estoque").titulo).toBe("Estoque de veículos");
    expect(telaDoModulo("revenda_veiculos", "agenda").titulo).toBe("Visitas e test drive");
    expect(telaDoModulo("consultorio", "agenda").titulo).toBe("Agenda");
  });
  it("empresa sem perfil informado continua só com finanças", () => {
    const r = esquemaEmpresa.parse({ nome: "Loja", atividade: "comercio", regime: "mei" });
    expect(r.perfil).toBe("financas");
  });
});

describe("permissões novas", () => {
  it("só o dono confere; todos veem clientes", () => {
    expect(pode("dono", "conferir")).toBe(true);
    expect(pode("colaborador", "conferir")).toBe(false);
    expect(pode("contador", "conferir")).toBe(false);
    for (const p of ["dono", "colaborador", "contador"] as const) expect(pode(p, "ver_clientes")).toBe(true);
  });
});
