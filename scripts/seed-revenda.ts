/**
 * Revenda de veículos de exemplo (Fase 5): o primeiro cliente piloto do ecossistema.
 * As finanças de 13 meses vêm do criarExtra (seed.ts); aqui entram
 * clientes, vendas ligadas a eles e três vendas que "chegaram pelo WhatsApp" esperando o check do dono.
 */
import { and, eq } from "drizzle-orm";
import type { BancoDeDados } from "../src/db";
import { clientes, empresaUsuarios, empresas, fontesReceita, usuarios, vendas } from "../src/db/schema";
import { type Data, somarDias } from "../src/lib/datas";
import { registrarAuditoria } from "../src/lib/servidor/auditoria";

type Usuario = typeof usuarios.$inferSelect;

interface Contexto {
  loja: typeof empresas.$inferSelect;
  dono: Usuario;
  colaborador: Usuario;
  admin: Usuario;
  hojeData: Data;
}

const reais = (r: number) => r * 100;

export async function semearRevenda(db: BancoDeDados, c: Contexto) {
  const { loja } = c;
  // O colaborador (vendedor) também atende a revenda.
  await db.insert(empresaUsuarios).values({ empresaId: loja.id, usuarioId: c.colaborador.id, papel: "colaborador" });

  const novos: Omit<typeof clientes.$inferInsert, "empresaId">[] = [
    { nome: "Rafael Moura", telefone: "5521998761234", origem: "whatsapp", observacao: "Procura SUV até R$ 95 mil. Tem um Onix 2019 para dar na troca." },
    { nome: "Patrícia Gomes", telefone: "5521987654321", origem: "whatsapp", observacao: "Quer financiar em 48x. Prefere automático." },
    { nome: "Lucas Andrade", telefone: "5521991112233", origem: "site", documento: "52998224725" },
    { nome: "Fernanda Lima", telefone: "5521994445566", origem: "indicacao", observacao: "Indicada pelo Rafael." },
    { nome: "Auto Peças Itaipuaçu", telefone: "552126378899", origem: "manual", documento: "11222333000181", observacao: "Compra carros para frota de entrega." },
  ];
  const lista = await db
    .insert(clientes)
    .values(novos.map((x) => ({ ...x, empresaId: loja.id, criadoPor: c.dono.id })))
    .returning();
  const cli = (nome: string) => lista.find((x) => x.nome === nome)!.id;

  const fontes = await db.select().from(fontesReceita).where(eq(fontesReceita.empresaId, loja.id));
  const fonte = (nome: string) => fontes.find((f) => f.nome === nome)!.id;

  // Duas vendas antigas já ligadas a clientes (aparecem no histórico do cliente).
  const doMes = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.empresaId, loja.id), eq(vendas.fonteReceitaId, fonte("Venda de veículos"))))
    .limit(2);
  if (doMes[0]) await db.update(vendas).set({ clienteId: cli("Lucas Andrade") }).where(eq(vendas.id, doMes[0].id));
  if (doMes[1]) await db.update(vendas).set({ clienteId: cli("Auto Peças Itaipuaçu") }).where(eq(vendas.id, doMes[1].id));

  // Três vendas que "chegaram sozinhas" e esperam o check (conferidoEm: null).
  const pendentes = await db
    .insert(vendas)
    .values([
      {
        descricao: "Sinal de reserva: Jeep Renegade 2021 prata",
        valorCentavos: reais(2000),
        fonteReceitaId: fonte("Venda de veículos"),
        formaPagamento: "pix" as const,
        status: "recebido" as const,
        clienteId: cli("Rafael Moura"),
      },
      {
        descricao: "Transferência e vistoria: Onix 2019 (troca)",
        valorCentavos: reais(850),
        fonteReceitaId: fonte("Despachante e documentação"),
        formaPagamento: "pix" as const,
        status: "recebido" as const,
        clienteId: cli("Rafael Moura"),
      },
      {
        descricao: "Entrada: HB20 2022 automático, restante financiado em 48x",
        valorCentavos: reais(15000),
        fonteReceitaId: fonte("Venda de veículos"),
        formaPagamento: "transferencia" as const,
        status: "a_receber" as const,
        clienteId: cli("Patrícia Gomes"),
      },
    ].map((v) => ({
      ...v,
      empresaId: loja.id,
      data: c.hojeData,
      dataRecebimento: v.status === "a_receber" ? somarDias(c.hojeData, 2) : c.hojeData,
      origem: "whatsapp" as const,
      conferidoEm: null,
      conferidoPor: null,
      criadoPor: null,
    })))
    .returning({ id: vendas.id, valor: vendas.valorCentavos });
  for (const v of pendentes)
    await registrarAuditoria(db, { empresaId: loja.id, ator: "agente", acao: "venda.registrar", entidade: "venda", entidadeId: v.id, dados: { valorCentavos: v.valor, origem: "whatsapp" } });
  await registrarAuditoria(db, { empresaId: loja.id, usuarioId: c.admin.id, ator: "admin", acao: "admin.criar_empresa", entidade: "empresa", entidadeId: loja.id, dados: { perfil: "revenda_veiculos" } });

  console.log(`Urutau Veículos: ${lista.length} clientes e ${pendentes.length} vendas do WhatsApp esperando conferência.`);
}
