import type { Encargos } from "@/lib/calculos/folha";

export const EXPLICA_ENCARGOS: Record<Encargos, string> = {
  nenhum:
    "No Simples Nacional (Anexos I, II, III e V), o INSS patronal, o RAT e o Sistema S já estão dentro do DAS. Por isso não aparecem no custo do funcionário.",
  completos:
    "No seu regime, a empresa paga à parte o INSS patronal (20%), o RAT e as contribuições para terceiros (Sistema S), sobre o salário e as reservas de 13º e férias.",
  mei_cpp: "Como MEI com empregado, a empresa paga a CPP de 3% sobre o salário, além do FGTS de 8%.",
};
