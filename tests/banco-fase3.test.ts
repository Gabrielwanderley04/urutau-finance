/**
 * Impostos contra o banco real: confere as tabelas fiscais gravadas pela migração e o cálculo
 * completo (séries de receita e folha, histórico informado à mão, Fator R, MEI e Presumido).
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarConexao } from "@/db";
import { criarPadroesDaEmpresa } from "@/db/padroes";
import { categoriasDespesa, despesas, empresas, fontesReceita, receitasHistoricas, simplesFaixas, vendas } from "@/db/schema";
import { resolverParametro } from "@/lib/calculos/parametros";
import { aliquotaEfetiva } from "@/lib/calculos/simples";
import { somarMeses } from "@/lib/datas";
import { carregarTabelasFiscais, impostoDoMes } from "@/lib/servidor/fiscal";

const url = process.env.TEST_DATABASE_URL;
const { db, cliente } = criarConexao(url ?? "postgres://invalido");
const R = (reais: number) => Math.round(reais * 100);

beforeAll(async () => {
  if (!url) throw new Error("Defina TEST_DATABASE_URL");
  await cliente.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await cliente.end();
});

async function empresa(dados: Partial<typeof empresas.$inferInsert> & Pick<typeof empresas.$inferInsert, "regime" | "atividade">) {
  const [e] = await db.insert(empresas).values({ nome: "Teste", ...dados }).returning();
  await db.transaction((tx) => criarPadroesDaEmpresa(tx, e.id, e.atividade));
  const fontes = await db.select().from(fontesReceita).where(eq(fontesReceita.empresaId, e.id));
  const cats = await db.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, e.id));
  return {
    e,
    comercio: fontes.find((f) => f.natureza === "comercio")?.id,
    servico: fontes.find((f) => f.natureza === "servico")?.id,
    proLabore: cats.find((c) => c.chaveSistema === "pro_labore")!.id,
  };
}

const venda = (empresaId: string, fonteReceitaId: string, data: string, valor: number) => ({
  empresaId, fonteReceitaId, data, valorCentavos: valor, formaPagamento: "pix" as const, status: "recebido" as const, dataRecebimento: data,
});

describe("tabelas fiscais gravadas", () => {
  it("cada anexo tem 6 faixas; da 1ª à 5ª a alíquota efetiva é contínua na troca de faixa", async () => {
    const faixas = await db.select().from(simplesFaixas);
    for (const anexo of ["I", "II", "III", "IV", "V"] as const) {
      const fs = faixas.filter((f) => f.anexo === anexo).sort((a, b) => a.faixa - b.faixa);
      expect(fs).toHaveLength(6);
      expect(fs[0].parcelaDeduzirCentavos).toBe(0);
      expect(fs.at(-1)!.receitaAteCentavos).toBe(R(4_800_000));
      // A 6ª faixa não é contínua por lei (acima do sublimite o ICMS/ISS sai do DAS); conferida abaixo.
      for (let k = 0; k < 4; k++) {
        const teto = fs[k].receitaAteCentavos;
        const conv = (f: (typeof fs)[number]) => ({ anexo, faixa: f.faixa, receitaAte: f.receitaAteCentavos, aliquotaNominal: f.aliquotaNominalPcm, parcelaDeduzir: f.parcelaDeduzirCentavos });
        // Se algum número da tabela estiver errado, aparece um "degrau" aqui.
        expect(Math.abs(aliquotaEfetiva(teto, conv(fs[k])) - aliquotaEfetiva(teto, conv(fs[k + 1]))), `Anexo ${anexo}, faixa ${k + 1}→${k + 2}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("6ª faixa de cada anexo confere com a LC 123/2006", async () => {
    const sexta = await db.select().from(simplesFaixas).where(eq(simplesFaixas.faixa, 6));
    const porAnexo = Object.fromEntries(sexta.map((f) => [f.anexo, [f.aliquotaNominalPcm, f.parcelaDeduzirCentavos]]));
    expect(porAnexo).toEqual({
      I: [19_000, R(378_000)],
      II: [30_000, R(720_000)],
      III: [33_000, R(648_000)],
      IV: [33_000, R(828_000)],
      V: [30_500, R(540_000)],
    });
  });

  it("DAS do MEI muda por ano conforme a vigência", async () => {
    const t = await carregarTabelasFiscais(db, "00000000-0000-0000-0000-000000000000");
    const p = (c: string, d: string) => resolverParametro(c, d, t.globais);
    expect([p("mei_das_comercio", "2026-05-01"), p("mei_das_servicos", "2026-05-01"), p("mei_das_ambos", "2026-05-01")]).toEqual([8_205, 8_605, 8_705]);
    expect(p("mei_das_comercio", "2025-12-01")).toBe(7_690);
    expect(() => p("mei_das_comercio", "2027-01-01")).toThrow(/sem valor vigente/);
  });

  it("acréscimo da LC 224: IRPJ desde jan/2026, CSLL desde abr/2026", async () => {
    const t = await carregarTabelasFiscais(db, "00000000-0000-0000-0000-000000000000");
    const p = (c: string, d: string) => resolverParametro(c, d, t.globais);
    expect(p("lc224_acrescimo_irpj", "2025-12-01")).toBe(0);
    expect(p("lc224_acrescimo_irpj", "2026-01-01")).toBe(10_000);
    expect(p("lc224_acrescimo_csll", "2026-03-01")).toBe(0);
    expect(p("lc224_acrescimo_csll", "2026-04-01")).toBe(10_000);
  });
});

describe("Simples com Fator R a partir dos lançamentos", () => {
  it("pró-labore conta na folha e decide entre Anexo III e V", async () => {
    const { e, servico, proLabore } = await empresa({ regime: "simples", atividade: "servicos", anexoServicos: "V", sujeitoFatorR: true, inicioAtividade: "2020-01-01" });
    // 12 meses de R$ 40 mil de receita (RBT12 = R$ 480 mil) e pró-labore de R$ 12 mil/mês (25%)
    for (let i = 1; i <= 12; i++) {
      const m = somarMeses("2026-10", -i);
      await db.insert(vendas).values(venda(e.id, servico!, `${m}-10`, R(40_000)));
      await db.insert(despesas).values({ empresaId: e.id, data: `${m}-05`, valorCentavos: R(12_000), categoriaId: proLabore, status: "pago", vencimento: `${m}-05`, pagoEm: `${m}-05` });
    }
    await db.insert(vendas).values(venda(e.id, servico!, "2026-10-10", R(40_000)));

    const antes = await impostoDoMes(db, e, "2026-10");
    if (antes.imposto.regime !== "simples") throw new Error();
    expect(antes.imposto.simples.rbt12.valor).toBe(R(480_000));
    expect(antes.imposto.simples.fatorR).toMatchObject({ fator: 30_000, anexo: "III" }); // 144k ÷ 480k = 30%
    // Anexo III, 3ª faixa: (480k × 13,5% − 17.640) ÷ 480k = 9,825% → R$ 3.930
    expect(antes.imposto.total).toBe(R(3_930));

    // Mês a mês informado à mão com folha menor: Fator R cai para 20% → Anexo V
    for (let i = 1; i <= 12; i++) await db.insert(receitasHistoricas).values({ empresaId: e.id, competencia: somarMeses("2026-10", -i), receitaCentavos: null, folhaCentavos: R(8_000) });
    const depois = await impostoDoMes(db, e, "2026-10");
    if (depois.imposto.regime !== "simples") throw new Error();
    expect(depois.imposto.simples.fatorR).toMatchObject({ fator: 20_000, anexo: "V" });
    expect(depois.imposto.simples.rbt12.valor).toBe(R(480_000)); // receita não informada: vale a lançada
    // Anexo V, 3ª faixa: (480k × 19,5% − 9.900) ÷ 480k = 17,4375% → R$ 6.975
    expect(depois.imposto.total).toBe(R(6_975));
  });

  it("histórico informado substitui a receita do mês no RBT12", async () => {
    const { e, comercio } = await empresa({ regime: "simples", atividade: "comercio", anexoComercio: "I", inicioAtividade: "2015-01-01" });
    await db.insert(vendas).values(venda(e.id, comercio!, "2026-10-10", R(10_000)));
    await db.insert(receitasHistoricas).values({ empresaId: e.id, competencia: "2026-03", receitaCentavos: R(300_000), folhaCentavos: null });
    const { imposto } = await impostoDoMes(db, e, "2026-10");
    if (imposto.regime !== "simples") throw new Error();
    expect(imposto.simples.rbt12.valor).toBe(R(300_000));
    // Anexo I, 2ª faixa: (300k × 7,3% − 5.940) ÷ 300k = 5,32% → R$ 532
    expect(imposto.total).toBe(R(532));
  });
});

describe("MEI e Lucro Presumido a partir dos lançamentos", () => {
  it("MEI: DAS fixo e alerta de 80% do limite", async () => {
    const { e, comercio } = await empresa({ regime: "mei", atividade: "comercio", inicioAtividade: "2022-01-01" });
    for (let m = 1; m <= 10; m++) await db.insert(vendas).values(venda(e.id, comercio!, `2026-${String(m).padStart(2, "0")}-15`, R(7_000)));
    await db.insert(vendas).values(venda(e.id, comercio!, "2025-12-15", R(50_000))); // ano anterior: não conta
    const { imposto } = await impostoDoMes(db, e, "2026-10");
    if (imposto.regime !== "mei") throw new Error();
    expect(imposto.total).toBe(8_205);
    expect(imposto.mei).toMatchObject({ faturamentoAno: R(70_000), situacao: "alerta", usoDoLimite: 86_420 });
  });

  it("Presumido: serviços com ISS da empresa", async () => {
    const { e, servico } = await empresa({ regime: "presumido", atividade: "servicos", aliquotaIssPcm: 5_000, inicioAtividade: "2015-01-01" });
    await db.insert(vendas).values(venda(e.id, servico!, "2026-10-10", R(100_000)));
    const { imposto } = await impostoDoMes(db, e, "2026-10");
    if (imposto.regime !== "presumido") throw new Error();
    expect(imposto.total).toBe(R(17_530));
    // Outubro é o 1º mês do trimestre: o trimestre até agora é o próprio mês
    expect(imposto.trimestre.total).toBe(R(4_800 + 1_200 + 2_880));
  });

  it("Lucro Real: sem cálculo nesta versão", async () => {
    const { e } = await empresa({ regime: "real", atividade: "servicos" });
    expect((await impostoDoMes(db, e, "2026-10")).imposto).toEqual({ regime: "real", total: null });
  });
});
