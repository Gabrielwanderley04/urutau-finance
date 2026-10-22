/**
 * Empresa fictícia para demonstração: "Padaria e Café Urutau", no Simples Nacional,
 * que vende produtos (Anexo I) e faz encomendas/buffet (serviço, Anexo III).
 * Gera 13 meses de vendas e despesas, com um mês de prejuízo, contas atrasadas e
 * a vencer. Também cria uma segunda empresa (MEI) para mostrar o multiempresa.
 *
 * Acessos (senha de todos: urutau123):
 *   dono@urutau.dev · colaborador@urutau.dev · contador@urutau.dev
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { criarConexao } from "../src/db";
import { criarPadroesDaEmpresa } from "../src/db/padroes";
import {
  categoriasDespesa,
  despesas,
  empresaUsuarios,
  empresas,
  fontesReceita,
  usuarios,
  vendas,
  dividas,
  folhaMensal,
  funcionarios,
  parcelasDivida,
  receitasHistoricas,
  type ChaveCategoria,
} from "../src/db/schema";
import { gerarCronograma } from "../src/lib/calculos/dividas";
import { type Data, diasNoMes, hoje, mesAtual, mesDe, somarDias, somarMeses, ultimosMeses } from "../src/lib/datas";
import { impostoDoMes } from "../src/lib/servidor/fiscal";
import { sincronizarFolha } from "../src/lib/servidor/folha";

const url = process.argv[2] ?? process.env.DATABASE_URL!;
const { db, cliente } = criarConexao(url);

// PRNG determinístico: o seed gera sempre os mesmos números.
function mulberry32(semente: number) {
  return () => {
    semente |= 0;
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const aleatorio = mulberry32(20261022);
/** Inteiro em centavos entre min e max (em centavos). */
const entre = (min: number, max: number) => min + Math.floor(aleatorio() * (max - min + 1));
const reais = (r: number) => r * 100;

const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, "dono@urutau.dev"));
if (existente) {
  console.log("Seed já aplicado. Use `npm run db:reset` para recriar.");
  await cliente.end();
  process.exit(0);
}

const senhaHash = await hash("urutau123");
const [dono, colaborador, contador] = await db
  .insert(usuarios)
  .values([
    { nome: "Marina Souza", email: "dono@urutau.dev", senhaHash },
    { nome: "Joana Lima", email: "colaborador@urutau.dev", senhaHash },
    { nome: "Carlos Pereira (contador)", email: "contador@urutau.dev", senhaHash },
  ])
  .returning();

const hojeData = hoje();
const mesHoje = mesAtual();

const padariaId = await db.transaction(async (tx) => {
  // ── Empresa principal ──────────────────────────────────────────────────────
  const [padaria] = await tx
    .insert(empresas)
    .values({
      nome: "Padaria e Café Urutau",
      cnpj: "11222333000181",
      atividade: "ambos",
      cidade: "Belo Horizonte",
      uf: "MG",
      regime: "simples",
      anexoComercio: "I",
      anexoServicos: "III",
      inicioAtividade: "2023-03-01",
    })
    .returning();
  await tx.insert(empresaUsuarios).values([
    { empresaId: padaria.id, usuarioId: dono.id, papel: "dono" },
    { empresaId: padaria.id, usuarioId: colaborador.id, papel: "colaborador" },
    { empresaId: padaria.id, usuarioId: contador.id, papel: "contador" },
  ]);
  await criarPadroesDaEmpresa(tx, padaria.id, "ambos");

  await tx
    .update(fontesReceita)
    .set({ nome: "Encomendas e buffet" })
    .where(and(eq(fontesReceita.empresaId, padaria.id), eq(fontesReceita.nome, "Serviços")));
  const fontes = await tx.select().from(fontesReceita).where(eq(fontesReceita.empresaId, padaria.id));
  const fonte = (nome: string) => fontes.find((f) => f.nome === nome)!.id;
  const cats = await tx.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, padaria.id));
  const cat = (chave: ChaveCategoria) => cats.find((c) => c.chaveSistema === chave)!.id;

  const meses = ultimosMeses(mesHoje, 13);
  // Sazonalidade: dezembro forte, janeiro/fevereiro fracos.
  const fatorMes: Record<string, number> = { "01": 0.8, "02": 0.82, "05": 1.05, "06": 1.08, "12": 1.35 };
  const mesPrejuizo = somarMeses(mesHoje, -5);

  type NovaVenda = typeof vendas.$inferInsert;
  type NovaDespesa = typeof despesas.$inferInsert;
  const listaVendas: NovaVenda[] = [];
  const listaDespesas: NovaDespesa[] = [];
  const faturamentoPorMes = new Map<string, number>();

  for (const mes of meses) {
    const fator = (fatorMes[mes.slice(5)] ?? 1) * (mes === mesPrejuizo ? 0.62 : 1);
    const ultimoDia = mes === mesHoje ? Number(hojeData.slice(8)) : diasNoMes(mes);
    let fatMes = 0;
    let vendasCartao = 0;

    for (let dia = 1; dia <= ultimoDia; dia++) {
      const data: Data = `${mes}-${String(dia).padStart(2, "0")}`;
      const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
      if (dow === 1) continue; // fecha às segundas
      const fimDeSemana = dow === 0 || dow === 6 ? 1.4 : 1;

      // Balcão: fechamento do dia, separado por forma de pagamento
      const balcao = Math.round(entre(reais(1300), reais(1900)) * fator * fimDeSemana);
      const pix = Math.round(balcao * 0.45);
      const credito = Math.round(balcao * 0.2);
      const debito = balcao - pix - credito;
      listaVendas.push(
        { empresaId: padaria.id, data, valorCentavos: pix, descricao: "Fechamento do caixa · Pix e dinheiro", fonteReceitaId: fonte("Loja física"), formaPagamento: "pix", status: "recebido", dataRecebimento: data, criadoPor: colaborador.id },
        { empresaId: padaria.id, data, valorCentavos: debito, descricao: "Fechamento do caixa · débito", fonteReceitaId: fonte("Loja física"), formaPagamento: "debito", status: "recebido", dataRecebimento: somarDias(data, 1), criadoPor: colaborador.id },
        // Crédito cai em 30 dias
        { empresaId: padaria.id, data, valorCentavos: credito, descricao: "Fechamento do caixa · crédito", fonteReceitaId: fonte("Loja física"), formaPagamento: "credito", status: somarDias(data, 30) <= hojeData ? "recebido" : "a_receber", dataRecebimento: somarDias(data, 30), criadoPor: colaborador.id },
      );
      vendasCartao += credito + debito;
      fatMes += balcao;

      if (dow === 0 || dow === 5 || dow === 6) {
        const delivery = Math.round(entre(reais(250), reais(600)) * fator);
        listaVendas.push({ empresaId: padaria.id, data, valorCentavos: delivery, descricao: "Pedidos do app de delivery", fonteReceitaId: fonte("Delivery"), formaPagamento: "transferencia", status: somarDias(data, 7) <= hojeData ? "recebido" : "a_receber", dataRecebimento: somarDias(data, 7), criadoPor: dono.id });
        fatMes += delivery;
      }
      if (dia % 4 === 0) {
        const site = Math.round(entre(reais(120), reais(380)) * fator);
        listaVendas.push({ empresaId: padaria.id, data, valorCentavos: site, descricao: "Cestas de café da manhã (site)", fonteReceitaId: fonte("Site"), formaPagamento: "pix", status: "recebido", dataRecebimento: data, criadoPor: dono.id });
        fatMes += site;
      }
    }

    // Encomendas e buffet: 2 a 3 eventos por mês, metade na entrega e metade em 15 dias
    const eventos = mes === mesPrejuizo ? 1 : 2 + Math.floor(aleatorio() * 2);
    for (let i = 0; i < eventos; i++) {
      const dia = Math.min(5 + i * 9 + Math.floor(aleatorio() * 4), ultimoDia);
      if (dia < 1) continue;
      const data: Data = `${mes}-${String(dia).padStart(2, "0")}`;
      const total = Math.round(entre(reais(2200), reais(4800)) * fator);
      const entrada = Math.round(total / 2);
      listaVendas.push(
        { empresaId: padaria.id, data, valorCentavos: entrada, descricao: `Buffet de evento #${i + 1} · entrada`, fonteReceitaId: fonte("Encomendas e buffet"), formaPagamento: "pix", status: "recebido", dataRecebimento: data, criadoPor: dono.id },
        { empresaId: padaria.id, data, valorCentavos: total - entrada, descricao: `Buffet de evento #${i + 1} · saldo`, fonteReceitaId: fonte("Encomendas e buffet"), formaPagamento: "boleto", status: somarDias(data, 15) <= hojeData ? "recebido" : "a_receber", dataRecebimento: somarDias(data, 15), criadoPor: dono.id },
      );
      fatMes += total;
    }
    faturamentoPorMes.set(mes, fatMes);

    // ── Despesas do mês ──────────────────────────────────────────────────────
    const d = (dia: number) => `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, "0")}`;
    const conta = (chave: ChaveCategoria, descricao: string, valor: number, vencimento: Data, data = `${mes}-01`): NovaDespesa => {
      // Atrasada de propósito: a conta de água do mês passado ficou sem pagar.
      const esquecida = mes === somarMeses(mesHoje, -1) && descricao === "Conta de água";
      const pago = vencimento <= hojeData && !esquecida;
      return { empresaId: padaria.id, data, valorCentavos: valor, descricao, categoriaId: cat(chave), status: pago ? "pago" : "a_pagar", vencimento, pagoEm: pago ? vencimento : null, criadoPor: dono.id };
    };

    listaDespesas.push(
      conta("contas_fixas", "Aluguel do ponto", reais(4800), d(10)),
      conta("contas_fixas", "Energia elétrica", entre(reais(980), reais(1350)), d(15)),
      conta("contas_fixas", "Conta de água", entre(reais(210), reais(320)), d(18)),
      conta("contas_fixas", "Internet e telefone", reais(189), d(12)),
      conta("contas_fixas", "Honorários do contador", reais(850), d(10)),
      conta("contas_fixas", "Sistema de caixa (PDV)", reais(149), d(5)),
      // Salários não são lançados aqui: a folha é gerada a partir do cadastro de funcionários.
      conta("pro_labore", "Pró-labore Marina", reais(4000), d(5)),
      conta("marketing", "Anúncios no Instagram", entre(reais(350), reais(700)), d(20)),
      // Taxa da maquininha ≈ 2,1% das vendas no cartão
      conta("juros_tarifas", "Taxas da maquininha", Math.round(vendasCartao * 0.021), d(28), d(28)),
      conta("juros_tarifas", "Tarifa do banco", reais(59), d(3)),
    );

    // Compras de insumos e mercadorias: ~33% do faturamento, em 4 compras
    const compras = [
      ["Farinha, açúcar e ovos (atacado)", 0.4],
      ["Laticínios e frios", 0.3],
      ["Café em grãos", 0.15],
      ["Embalagens e descartáveis", 0.15],
    ] as const;
    for (const [i, [descricao, peso]] of compras.entries()) {
      const dia = 3 + i * 7;
      const valor = Math.round(fatMes * 0.33 * peso * (mes === mesPrejuizo ? 1.45 : 1));
      listaDespesas.push(conta("mercadorias", descricao, valor, d(dia + 7), d(dia)));
    }

    // Mês de prejuízo: reforma do forno
    if (mes === mesPrejuizo) listaDespesas.push(conta("outras", "Conserto do forno industrial", reais(7400), d(22), d(22)));

    // DAS do mês anterior (≈ 6,4% do faturamento), pago dia 20. Conta só no caixa.
    const fatAnterior = faturamentoPorMes.get(somarMeses(mes, -1));
    if (fatAnterior) listaDespesas.push(conta("impostos", "DAS do Simples Nacional (mês anterior)", Math.round(fatAnterior * 0.064), d(20), d(20)));
  }

  for (let i = 0; i < listaVendas.length; i += 500) await tx.insert(vendas).values(listaVendas.slice(i, i + 500));
  for (let i = 0; i < listaDespesas.length; i += 500) await tx.insert(despesas).values(listaDespesas.slice(i, i + 500));
  console.log(`Padaria e Café Urutau: ${listaVendas.length} vendas, ${listaDespesas.length} despesas.`);

  // ── Segunda empresa (MEI): perto do limite anual, para mostrar o alerta ─────
  const [mei] = await tx
    .insert(empresas)
    .values({ nome: "Marina Doces (MEI)", atividade: "comercio", cidade: "Belo Horizonte", uf: "MG", regime: "mei", inicioAtividade: "2022-05-02" })
    .returning();
  await tx.insert(empresaUsuarios).values({ empresaId: mei.id, usuarioId: dono.id, papel: "dono" });
  await criarPadroesDaEmpresa(tx, mei.id, "comercio");
  const [lojaMei] = await tx.select().from(fontesReceita).where(eq(fontesReceita.empresaId, mei.id)).orderBy(fontesReceita.ordem).limit(1);
  const vendasMei: NovaVenda[] = ultimosMeses(mesHoje, 13).flatMap((mes) =>
    [6, 13, 20, 27]
      .map((dia) => `${mes}-${String(dia).padStart(2, "0")}`)
      .filter((data) => data <= hojeData)
      .map((data) => ({ empresaId: mei.id, data, valorCentavos: entre(reais(1500), reais(2100)), descricao: "Bolos e doces da semana", fonteReceitaId: lojaMei.id, formaPagamento: "pix" as const, status: "recebido" as const, dataRecebimento: data, criadoPor: dono.id })),
  );
  await tx.insert(vendas).values(vendasMei);
  console.log(`Marina Doces (MEI): ${vendasMei.length} vendas.`);
  return padaria.id;
});

// ── Funcionários: a folha de cada mês é gerada pelo próprio sistema ─────────
const [padaria] = await db.select().from(empresas).where(eq(empresas.id, padariaId));
const inicioFolha = ultimosMeses(mesHoje, 13)[0];
await db.insert(funcionarios).values([
  { empresaId: padariaId, nome: "Joana Lima", cargo: "Atendente", salarioBrutoCentavos: reais(1800), admissao: "2024-02-01", vtCentavos: reais(180), vrCentavos: reais(300), folhaDesde: inicioFolha },
  { empresaId: padariaId, nome: "Roberto Alves", cargo: "Padeiro", salarioBrutoCentavos: reais(2600), admissao: "2023-04-10", vtCentavos: reais(120), vrCentavos: reais(300), planoSaudeCentavos: reais(180), folhaDesde: inicioFolha },
  // Admitida no meio do mês, há 4 meses: mostra a folha proporcional.
  { empresaId: padariaId, nome: "Fernanda Costa", cargo: "Confeiteira", salarioBrutoCentavos: reais(2300), admissao: `${somarMeses(mesHoje, -4)}-16`, vtCentavos: reais(150), vrCentavos: reais(300), folhaDesde: inicioFolha },
]);
await sincronizarFolha(db, padaria, mesHoje, mesHoje);
// Meses anteriores: folha paga no dia 5 do mês seguinte.
const folhas = await db.select().from(folhaMensal).where(eq(folhaMensal.empresaId, padariaId));
for (const f of folhas.filter((f) => f.vencimento <= hojeData))
  await db.update(folhaMensal).set({ status: "pago", pagoEm: f.vencimento }).where(eq(folhaMensal.id, f.id));
console.log(`Folha: ${folhas.length} linhas geradas para 3 funcionários.`);

// ── Dívidas ─────────────────────────────────────────────────────────────────
const contratos = [
  { credor: "Banco do Brasil · capital de giro", tipo: "emprestimo" as const, valor: reais(30000), juros: 2_100, n: 24, primeira: `${somarMeses(mesHoje, -8)}-15`, observacao: "Contrato 4471-2. Usado para reformar a vitrine." },
  { credor: "Sicoob · forno novo", tipo: "financiamento" as const, valor: reais(18000), juros: 1_490, n: 36, primeira: `${somarMeses(mesHoje, -4)}-20`, observacao: "Forno industrial 2 câmaras" },
  { credor: "Moinho Bom Trigo", tipo: "fornecedor" as const, valor: reais(4800), juros: 0, n: 4, primeira: `${somarMeses(mesHoje, -1)}-25`, observacao: "Compra de farinha em atacado" },
  { credor: "Receita Federal · parcelamento do Simples", tipo: "imposto_parcelado" as const, valor: reais(6000), juros: 1_000, n: 30, primeira: `${somarMeses(mesHoje, -10)}-28`, observacao: "Parcelamento de DAS em atraso de 2025" },
];
for (const c of contratos) {
  const crono = gerarCronograma({ saldoDevedor: c.valor, jurosMensais: c.juros, numParcelas: c.n, primeiroVencimento: c.primeira, diaVencimento: Number(c.primeira.slice(8)) });
  const [d] = await db
    .insert(dividas)
    .values({ empresaId: padariaId, credor: c.credor, tipo: c.tipo, valorOriginalCentavos: c.valor, saldoDevedorCentavos: c.valor, jurosMensaisPcm: c.juros, numParcelas: c.n, valorParcelaCentavos: crono.valorParcela, diaVencimento: Number(c.primeira.slice(8)), primeiroVencimento: c.primeira, observacao: c.observacao })
    .returning();
  await db.insert(parcelasDivida).values(
    crono.parcelas.map((p) => {
      const paga = p.vencimento < hojeData;
      return { empresaId: padariaId, dividaId: d.id, ...p, status: paga ? ("pago" as const) : ("a_pagar" as const), pagoEm: paga ? p.vencimento : null };
    }),
  );
}
console.log(`Dívidas: ${contratos.length} contratos com parcelas.`);

// ── Histórico anterior da padaria: os 12 meses antes dos lançamentos ───────
// Sem isso, o RBT12 dos primeiros meses do gráfico sairia baixo demais.
const historico = ultimosMeses(somarMeses(mesHoje, -13), 12).map((competencia) => ({
  empresaId: padariaId,
  competencia,
  receitaCentavos: entre(reais(44000), reais(52000)),
  folhaCentavos: entre(reais(8000), reais(8600)),
}));
await db.insert(receitasHistoricas).values(historico);

// O DAS pago em cada mês é o imposto estimado do mês anterior, calculado pelo próprio sistema.
const das = await db
  .select({ id: despesas.id, data: despesas.data })
  .from(despesas)
  .innerJoin(categoriasDespesa, eq(categoriasDespesa.id, despesas.categoriaId))
  .where(and(eq(despesas.empresaId, padariaId), eq(categoriasDespesa.chaveSistema, "impostos")));
for (const d of das) {
  const { imposto } = await impostoDoMes(db, padaria, somarMeses(mesDe(d.data), -1));
  if (imposto.total) await db.update(despesas).set({ valorCentavos: imposto.total }).where(eq(despesas.id, d.id));
}
console.log(`Padaria: ${historico.length} meses de histórico; ${das.length} guias de DAS ajustadas ao imposto estimado.`);

// ── Empresas extras da Fase 3: Fator R (Anexo V) e Lucro Presumido ─────────
interface Extra {
  empresa: typeof empresas.$inferInsert;
  fontes: { nome: string; natureza: "comercio" | "servico"; mensal: [number, number]; lancamentos: number }[];
  despesasFixas: [ChaveCategoria, string, number][];
  mercadorias?: number; // % da receita de comércio
  proLabore: number;
  funcionarios: Omit<typeof funcionarios.$inferInsert, "empresaId" | "folhaDesde">[];
  crescimento: number; // % ao mês
}

async function criarExtra(x: Extra) {
  const [e] = await db.insert(empresas).values(x.empresa).returning();
  await db.insert(empresaUsuarios).values([
    { empresaId: e.id, usuarioId: dono.id, papel: "dono" },
    { empresaId: e.id, usuarioId: contador.id, papel: "contador" },
  ]);
  await db.transaction((tx) => criarPadroesDaEmpresa(tx, e.id, e.atividade));
  await db.delete(fontesReceita).where(eq(fontesReceita.empresaId, e.id));
  const fontes = await db
    .insert(fontesReceita)
    .values(x.fontes.map((f, i) => ({ empresaId: e.id, nome: f.nome, natureza: f.natureza, ordem: i })))
    .returning();
  const cats = await db.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, e.id));
  const cat = (c: ChaveCategoria) => cats.find((k) => k.chaveSistema === c)!.id;
  const inicio = mesDe(x.empresa.inicioAtividade!);
  const meses = ultimosMeses(mesHoje, 13).filter((m) => m >= inicio);
  const novasVendas: (typeof vendas.$inferInsert)[] = [];
  const novasDespesas: (typeof despesas.$inferInsert)[] = [];
  const pago = (v: Data) => (v <= hojeData ? { status: "pago" as const, pagoEm: v } : { status: "a_pagar" as const, pagoEm: null });

  meses.forEach((mes, k) => {
    const fator = (1 + x.crescimento / 100) ** k;
    const ultimoDia = mes === mesHoje ? Number(hojeData.slice(8)) : diasNoMes(mes);
    let comercio = 0;
    x.fontes.forEach((f, i) => {
      for (let j = 0; j < f.lancamentos; j++) {
        const dia = Math.min(ultimoDia, 3 + Math.floor(((j + 0.5) * 26) / f.lancamentos));
        const data = `${mes}-${String(dia).padStart(2, "0")}`;
        const valor = Math.round((entre(reais(f.mensal[0]), reais(f.mensal[1])) / f.lancamentos) * fator);
        if (f.natureza === "comercio") comercio += valor;
        const receber = somarDias(data, 15);
        novasVendas.push({
          empresaId: e.id, data, valorCentavos: valor, descricao: `${f.nome} · ${j + 1}`, fonteReceitaId: fontes[i].id,
          formaPagamento: f.natureza === "servico" ? "boleto" : "pix",
          status: receber <= hojeData ? "recebido" : "a_receber", dataRecebimento: receber, criadoPor: dono.id,
        });
      }
    });
    const d = (dia: number) => `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, "0")}`;
    for (const [chave, descricao, valor] of x.despesasFixas)
      novasDespesas.push({ empresaId: e.id, data: d(1), valorCentavos: reais(valor), descricao, categoriaId: cat(chave), vencimento: d(10), ...pago(d(10)), criadoPor: dono.id });
    novasDespesas.push({ empresaId: e.id, data: d(1), valorCentavos: reais(x.proLabore), descricao: "Pró-labore", categoriaId: cat("pro_labore"), vencimento: d(5), ...pago(d(5)), criadoPor: dono.id });
    if (x.mercadorias && comercio)
      novasDespesas.push({ empresaId: e.id, data: d(8), valorCentavos: Math.round((comercio * x.mercadorias) / 100), descricao: "Compra de peças", categoriaId: cat("mercadorias"), vencimento: d(15), ...pago(d(15)), criadoPor: dono.id });
  });
  await db.insert(vendas).values(novasVendas);
  await db.insert(despesas).values(novasDespesas);
  // Meses entre a abertura e o primeiro lançamento (até 2 anos): informados como histórico.
  const anteriores: (typeof receitasHistoricas.$inferInsert)[] = [];
  for (let m = inicio > somarMeses(mesHoje, -24) ? inicio : somarMeses(mesHoje, -24); m < meses[0]; m = somarMeses(m, 1))
    anteriores.push({ empresaId: e.id, competencia: m, receitaCentavos: x.fontes.reduce((t, f) => t + entre(reais(f.mensal[0]), reais(f.mensal[1])), 0) * 0.85, folhaCentavos: reais(x.proLabore) });
  if (anteriores.length) await db.insert(receitasHistoricas).values(anteriores.map((a) => ({ ...a, receitaCentavos: Math.round(a.receitaCentavos!) })));
  if (x.funcionarios.length) {
    await db.insert(funcionarios).values(x.funcionarios.map((f) => ({ ...f, empresaId: e.id, folhaDesde: meses[0] })));
    await sincronizarFolha(db, e, mesHoje, mesHoje);
    const linhas = await db.select().from(folhaMensal).where(eq(folhaMensal.empresaId, e.id));
    for (const l of linhas.filter((l) => l.vencimento <= hojeData))
      await db.update(folhaMensal).set({ status: "pago", pagoEm: l.vencimento }).where(eq(folhaMensal.id, l.id));
  }
  // Guia de impostos do mês anterior, paga no dia 20 (só caixa).
  for (const mes of meses.slice(1)) {
    const { imposto } = await impostoDoMes(db, e, somarMeses(mes, -1));
    if (imposto.total)
      await db.insert(despesas).values({ empresaId: e.id, data: `${mes}-20`, valorCentavos: imposto.total, descricao: "Impostos do mês anterior", categoriaId: cat("impostos"), vencimento: `${mes}-20`, ...pago(`${mes}-20`), criadoPor: dono.id });
  }
  console.log(`${e.nome}: ${novasVendas.length} vendas, ${novasDespesas.length} despesas, ${x.funcionarios.length} funcionários.`);
}

// Estúdio de design no Anexo V com Fator R: só com pró-labore, a folha fica abaixo de 28%;
// com a designer contratada há 7 meses, o Fator R sobe e a empresa passa para o Anexo III.
await criarExtra({
  empresa: { nome: "Estúdio Urutau Design", cnpj: "45723174000110", atividade: "servicos", cidade: "Recife", uf: "PE", regime: "simples", anexoServicos: "V", sujeitoFatorR: true, inicioAtividade: "2025-02-03" },
  fontes: [
    { nome: "Projetos de identidade visual", natureza: "servico", mensal: [18000, 24000], lancamentos: 3 },
    { nome: "Gestão de redes (mensalidades)", natureza: "servico", mensal: [12000, 13000], lancamentos: 4 },
  ],
  despesasFixas: [["contas_fixas", "Coworking", 1200], ["contas_fixas", "Assinaturas de software", 450], ["marketing", "Portfólio e anúncios", 300]],
  proLabore: 7000,
  funcionarios: [{ nome: "Lia Barros", cargo: "Designer", salarioBrutoCentavos: reais(4800), admissao: `${somarMeses(mesHoje, -7)}-01`, vrCentavos: reais(400) }],
  crescimento: 1,
});

// Manutenção no Lucro Presumido: serviços + venda de peças, com adicional do IRPJ e encargos patronais.
await criarExtra({
  empresa: { nome: "Urutau Manutenção Industrial", cnpj: "06990590000123", atividade: "ambos", cidade: "Contagem", uf: "MG", regime: "presumido", aliquotaIssPcm: 3_000, aliquotaIcmsPcm: 4_000, inicioAtividade: "2019-06-10" },
  fontes: [
    { nome: "Contratos de manutenção", natureza: "servico", mensal: [82000, 96000], lancamentos: 5 },
    { nome: "Venda de peças", natureza: "comercio", mensal: [35000, 45000], lancamentos: 6 },
  ],
  despesasFixas: [["contas_fixas", "Aluguel do galpão", 6500], ["contas_fixas", "Energia e água", 1900], ["contas_fixas", "Contabilidade", 1800], ["juros_tarifas", "Tarifas bancárias", 180]],
  mercadorias: 62,
  proLabore: 9000,
  funcionarios: [
    { nome: "Marcos Dias", cargo: "Técnico eletromecânico", salarioBrutoCentavos: reais(4200), admissao: "2021-03-01", vtCentavos: reais(160), vrCentavos: reais(500), planoSaudeCentavos: reais(320) },
    { nome: "Paula Reis", cargo: "Técnica de manutenção", salarioBrutoCentavos: reais(3900), admissao: "2022-08-15", vtCentavos: reais(160), vrCentavos: reais(500), planoSaudeCentavos: reais(320) },
    { nome: "André Melo", cargo: "Auxiliar administrativo", salarioBrutoCentavos: reais(2300), admissao: "2023-01-09", vtCentavos: reais(180), vrCentavos: reais(500) },
  ],
  crescimento: 0.5,
});

await cliente.end();
console.log("\nPronto! Entre com dono@urutau.dev / urutau123 (também colaborador@ e contador@).");
