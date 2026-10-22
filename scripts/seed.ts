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
  type ChaveCategoria,
} from "../src/db/schema";
import { gerarCronograma } from "../src/lib/calculos/dividas";
import { type Data, diasNoMes, hoje, mesAtual, somarDias, somarMeses, ultimosMeses } from "../src/lib/datas";
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

  // ── Segunda empresa (MEI) para demonstrar o multiempresa ──────────────────
  const [mei] = await tx
    .insert(empresas)
    .values({ nome: "Marina Doces (MEI)", atividade: "comercio", cidade: "Belo Horizonte", uf: "MG", regime: "mei" })
    .returning();
  await tx.insert(empresaUsuarios).values({ empresaId: mei.id, usuarioId: dono.id, papel: "dono" });
  await criarPadroesDaEmpresa(tx, mei.id, "comercio");
  const [lojaMei] = await tx.select().from(fontesReceita).where(eq(fontesReceita.empresaId, mei.id)).limit(1);
  const vendasMei: NovaVenda[] = ultimosMeses(mesHoje, 6).flatMap((mes) =>
    [6, 13, 20, 27]
      .map((dia) => `${mes}-${String(dia).padStart(2, "0")}`)
      .filter((data) => data <= hojeData)
      .map((data) => ({ empresaId: mei.id, data, valorCentavos: entre(reais(1200), reais(1900)), descricao: "Bolos e doces da semana", fonteReceitaId: lojaMei.id, formaPagamento: "pix" as const, status: "recebido" as const, dataRecebimento: data, criadoPor: dono.id })),
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

await cliente.end();
console.log("\nPronto! Entre com dono@urutau.dev / urutau123 (também colaborador@ e contador@).");
