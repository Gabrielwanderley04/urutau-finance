import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Convenções
 * - Dinheiro: bigint em centavos (sufixo _centavos). Percentuais: inteiro em pcm (1% = 1000).
 * - Toda tabela de negócio tem empresa_id. Referências entre tabelas de negócio usam
 *   chave composta (empresa_id, id), então o banco recusa ligar dados de empresas diferentes.
 * - Exclusão lógica via excluido_em.
 */

const centavos = (nome: string) => bigint(nome, { mode: "number" });
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const excluidoEm = () => timestamp("excluido_em", { withTimezone: true });

export const atividadeEnum = pgEnum("atividade", ["comercio", "servicos", "ambos"]);
export const regimeEnum = pgEnum("regime_tributario", ["mei", "simples", "presumido", "real"]);
export const anexoEnum = pgEnum("anexo_simples", ["I", "II", "III", "IV", "V"]);
export const papelEnum = pgEnum("papel", ["dono", "colaborador", "contador"]);
export const naturezaEnum = pgEnum("natureza_receita", ["comercio", "servico"]);
export const formaPagamentoEnum = pgEnum("forma_pagamento", [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "boleto",
  "transferencia",
  "outro",
]);
export const statusVendaEnum = pgEnum("status_venda", ["recebido", "a_receber"]);
export const statusDespesaEnum = pgEnum("status_despesa", ["pago", "a_pagar"]);
export const comportamentoEnum = pgEnum("comportamento_custo", ["fixo", "variavel"]);
export const chaveCategoriaEnum = pgEnum("chave_categoria", [
  "contas_fixas",
  "funcionarios",
  "mercadorias",
  "impostos",
  "pro_labore",
  "marketing",
  "juros_tarifas",
  "outras",
]);
export const origemDespesaEnum = pgEnum("origem_despesa", ["manual", "recorrente"]);
export const tratamentoMercadoriasEnum = pgEnum("tratamento_mercadorias", ["despesa_na_compra", "cmv"]);

// ─── Acesso ──────────────────────────────────────────────────────────────────

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  superadmin: boolean("superadmin").notNull().default(false),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const sessoes = pgTable(
  "sessoes",
  {
    tokenHash: text("token_hash").primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("sessoes_usuario_idx").on(t.usuarioId)],
);

// ─── Empresa ─────────────────────────────────────────────────────────────────

export const empresas = pgTable(
  "empresas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    cnpj: text("cnpj"),
    atividade: atividadeEnum("atividade").notNull(),
    cidade: text("cidade"),
    uf: text("uf"),
    regime: regimeEnum("regime").notNull(),
    anexoComercio: anexoEnum("anexo_comercio"),
    anexoServicos: anexoEnum("anexo_servicos"),
    sujeitoFatorR: boolean("sujeito_fator_r").notNull().default(false),
    aliquotaIssPcm: integer("aliquota_iss_pcm"),
    aliquotaIcmsPcm: integer("aliquota_icms_pcm"),
    inicioAtividade: date("inicio_atividade"),
    tratamentoMercadorias: tratamentoMercadoriasEnum("tratamento_mercadorias")
      .notNull()
      .default("despesa_na_compra"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    check("empresas_cnpj_formato", sql`${t.cnpj} is null or ${t.cnpj} ~ '^[0-9]{14}$'`),
    check("empresas_uf_formato", sql`${t.uf} is null or ${t.uf} ~ '^[A-Z]{2}$'`),
    check("empresas_anexo_comercio", sql`${t.anexoComercio} is null or ${t.anexoComercio} in ('I','II')`),
    check(
      "empresas_anexo_servicos",
      sql`${t.anexoServicos} is null or ${t.anexoServicos} in ('III','IV','V')`,
    ),
  ],
);

export const empresaUsuarios = pgTable(
  "empresa_usuarios",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    papel: papelEnum("papel").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.usuarioId] }), index("eu_usuario_idx").on(t.usuarioId)],
);

/** Faturamento e folha de meses anteriores ao uso do sistema (para RBT12 e Fator R). */
export const receitasHistoricas = pgTable(
  "receitas_historicas",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    competencia: text("competencia").notNull(), // AAAA-MM
    receitaCentavos: centavos("receita_centavos").notNull().default(0),
    folhaCentavos: centavos("folha_centavos").notNull().default(0),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.empresaId, t.competencia] }),
    check("rh_competencia", sql`${t.competencia} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("rh_valores", sql`${t.receitaCentavos} >= 0 and ${t.folhaCentavos} >= 0`),
  ],
);

// ─── Vendas ──────────────────────────────────────────────────────────────────

export const fontesReceita = pgTable(
  "fontes_receita",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    natureza: naturezaEnum("natureza").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [unique("fontes_empresa_id_uq").on(t.empresaId, t.id)],
);

export const vendas = pgTable(
  "vendas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    valorCentavos: centavos("valor_centavos").notNull(),
    descricao: text("descricao").notNull().default(""),
    fonteReceitaId: uuid("fonte_receita_id").notNull(),
    formaPagamento: formaPagamentoEnum("forma_pagamento").notNull(),
    status: statusVendaEnum("status").notNull(),
    /** Prevista enquanto a_receber; efetiva quando recebido. */
    dataRecebimento: date("data_recebimento").notNull(),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    foreignKey({
      name: "vendas_fonte_fk",
      columns: [t.empresaId, t.fonteReceitaId],
      foreignColumns: [fontesReceita.empresaId, fontesReceita.id],
    }),
    check("vendas_valor_positivo", sql`${t.valorCentavos} > 0`),
    index("vendas_empresa_data_idx").on(t.empresaId, t.data),
    index("vendas_empresa_receb_idx").on(t.empresaId, t.dataRecebimento),
  ],
);

// ─── Despesas ────────────────────────────────────────────────────────────────

export const categoriasDespesa = pgTable(
  "categorias_despesa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** Identifica as categorias padrão para os lançamentos automáticos; null nas criadas pelo usuário. */
    chaveSistema: chaveCategoriaEnum("chave_sistema"),
    comportamento: comportamentoEnum("comportamento").notNull(),
    entraNoLucro: boolean("entra_no_lucro").notNull().default(true),
    entraNaFolhaFatorR: boolean("entra_na_folha_fator_r").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("categorias_empresa_id_uq").on(t.empresaId, t.id),
    unique("categorias_chave_uq").on(t.empresaId, t.chaveSistema),
  ],
);

export const despesas = pgTable(
  "despesas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    /** Competência: mês em que a despesa pesa no lucro. */
    data: date("data").notNull(),
    valorCentavos: centavos("valor_centavos").notNull(),
    descricao: text("descricao").notNull().default(""),
    categoriaId: uuid("categoria_id").notNull(),
    status: statusDespesaEnum("status").notNull(),
    vencimento: date("vencimento").notNull(),
    pagoEm: date("pago_em"),
    origem: origemDespesaEnum("origem").notNull().default("manual"),
    /** Preenchido pela Fase 4 (despesas recorrentes). */
    recorrenciaId: uuid("recorrencia_id"),
    /** Reservado para o controle de estoque (compra de mercadoria → entrada no estoque). */
    compraId: uuid("compra_id"),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    foreignKey({
      name: "despesas_categoria_fk",
      columns: [t.empresaId, t.categoriaId],
      foreignColumns: [categoriasDespesa.empresaId, categoriasDespesa.id],
    }),
    check("despesas_valor_positivo", sql`${t.valorCentavos} > 0`),
    check(
      "despesas_pago_coerente",
      sql`(${t.status} = 'pago') = (${t.pagoEm} is not null)`,
    ),
    index("despesas_empresa_data_idx").on(t.empresaId, t.data),
    index("despesas_empresa_venc_idx").on(t.empresaId, t.vencimento),
  ],
);

export type Papel = (typeof papelEnum.enumValues)[number];
export type Regime = (typeof regimeEnum.enumValues)[number];
export type Atividade = (typeof atividadeEnum.enumValues)[number];
export type FormaPagamento = (typeof formaPagamentoEnum.enumValues)[number];
export type ChaveCategoria = (typeof chaveCategoriaEnum.enumValues)[number];
export type Empresa = typeof empresas.$inferSelect;
