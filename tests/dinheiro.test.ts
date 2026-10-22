import { describe, expect, it } from "vitest";
import {
  aplicarPcm,
  centavosParaInput,
  dividirArredondado,
  dividirParaCima,
  formatarPcm,
  formatarReais,
  lerPercentual,
  lerReais,
  razaoPcm,
} from "@/lib/dinheiro";

describe("lerReais", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234,5", 123450],
    ["R$ 10", 1000],
    ["10.50", 1050],
    ["0,01", 1],
    ["1.000.000", 100000000],
    ["-25,00", -2500],
  ])("%s → %i centavos", (entrada, esperado) => {
    expect(lerReais(entrada)).toBe(esperado);
  });

  it.each(["", "abc", "1,234,56", "12,345", "1.23.4", "10.5.0"])("rejeita %s", (entrada) => {
    expect(lerReais(entrada)).toBeNull();
  });

  it("não sofre erro de ponto flutuante (0,1 + 0,2)", () => {
    expect(lerReais("0,10")! + lerReais("0,20")!).toBe(30);
    expect(lerReais("19,99")).toBe(1999); // 19.99 * 100 em float dá 1998.9999…
  });
});

describe("arredondamento inteiro", () => {
  it("meio arredonda para longe do zero", () => {
    expect(dividirArredondado(5, 2)).toBe(3);
    expect(dividirArredondado(-5, 2)).toBe(-3);
    expect(dividirArredondado(4, 3)).toBe(1);
    expect(dividirArredondado(5, 3)).toBe(2);
  });
  it("teto", () => {
    expect(dividirParaCima(10, 3)).toBe(4);
    expect(dividirParaCima(9, 3)).toBe(3);
  });
  it("não estoura com valores grandes (BigInt)", () => {
    // R$ 900 milhões × 28%
    expect(aplicarPcm(90_000_000_000, 28_000)).toBe(25_200_000_000);
  });
  it("aplica percentual", () => {
    expect(aplicarPcm(10_000, 650)).toBe(65); // 0,65% de R$ 100
    expect(aplicarPcm(333, 50_000)).toBe(167); // metade de R$ 3,33 → 1,665 → 1,67
  });
  it("razão em pcm", () => {
    expect(razaoPcm(1, 3)).toBe(33_333);
    expect(razaoPcm(-50, 200)).toBe(-25_000);
    expect(razaoPcm(1, 0)).toBeNull();
  });
});

describe("formatação", () => {
  it("reais", () => {
    expect(formatarReais(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatarReais(-5).replace(/\s/g, " ")).toBe("-R$ 0,05");
    expect(formatarReais(100000000).replace(/\s/g, " ")).toBe("R$ 1.000.000,00");
  });
  it("percentuais", () => {
    expect(formatarPcm(28_000)).toBe("28%");
    expect(formatarPcm(650)).toBe("0,65%");
    expect(formatarPcm(33_333)).toBe("33,33%");
    expect(formatarPcm(-12_500, 1)).toBe("-12,5%");
  });
  it("lê percentual e devolve para input", () => {
    expect(lerPercentual("2,5")).toBe(2_500);
    expect(lerPercentual("0,65%")).toBe(650);
    expect(lerPercentual("x")).toBeNull();
    expect(centavosParaInput(123456)).toBe("1234,56");
  });
});
