import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
export const origemDespesaEnum = pgEnum("origem_despesa", ["manual", "recorrente", "imposto"]);
export const tipoProvisaoEnum = pgEnum("tipo_provisao", ["decimo_terceiro", "ferias"]);
export const statusPagamentoEnum = pgEnum("status_pagamento", ["pago", "a_pagar"]);
export const tipoDividaEnum = pgEnum("tipo_divida", [
  "emprestimo",
  "financiamento",
  "fornecedor",
  "imposto_parcelado",
  "cartao",
  "outro",
]);
export const tratamentoMercadoriasEnum = pgEnum("tratamento_mercadorias", ["despesa_na_compra", "cmv"]);
/** Tipo de negócio: decide a tela inicial, o menu e os módulos ligados por padrão (src/lib/perfis.ts). */
export const perfilEnum = pgEnum("perfil_empresa", [
  "financas",
  "revenda_veiculos",
  "consultorio",
  "varejo",
  "servicos",
  "alimentacao",
]);
export const moduloEnum = pgEnum("modulo", ["financas", "agenda", "estoque", "whatsapp"]);
/** Por onde a venda entrou. Só "manual" já nasce conferida; as automáticas esperam o check do dono. */
export const origemVendaEnum = pgEnum("origem_venda", ["manual", "whatsapp", "agenda", "balcao", "site"]);
export const origemClienteEnum = pgEnum("origem_cliente", ["manual", "whatsapp", "site", "balcao", "indicacao"]);
export const atorEnum = pgEnum("ator", ["usuario", "admin", "agente", "sistema"]);
export const statusTarefaEnum = pgEnum("status_tarefa", ["pendente", "executando", "concluida", "falhou"]);

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
    perfil: perfilEnum("perfil").notNull().default("financas"),
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

/** Módulos ligados para a empresa. Sem linha = vale o padrão do perfil. */
export const empresaModulos = pgTable(
  "empresa_modulos",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    modulo: moduloEnum("modulo").notNull(),
    ativo: boolean("ativo").notNull(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.modulo] })],
);

/** Faturamento e folha de meses anteriores ao uso do sistema (para RBT12 e Fator R). */
export const receitasHistoricas = pgTable(
  "receitas_historicas",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    competencia: text("competencia").notNull(), // AAAA-MM
    /** null = não informado (vale o que foi lançado no sistema). */
    receitaCentavos: centavos("receita_centavos"),
    folhaCentavos: centavos("folha_centavos"),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.empresaId, t.competencia] }),
    check("rh_competencia", sql`${t.competencia} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("rh_valores", sql`${t.receitaCentavos} >= 0 and ${t.folhaCentavos} >= 0`),
  ],
);

// ─── Clientes ────────────────────────────────────────────────────────────────

/** Quem compra ou é atendido. No WhatsApp, o telefone identifica o cliente. */
export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    /** Só dígitos com DDI (ex.: 5521999998888), o mesmo formato que o WhatsApp entrega. */
    telefone: text("telefone"),
    email: text("email"),
    /** CPF ou CNPJ, só dígitos. */
    documento: text("documento"),
    observacao: text("observacao").notNull().default(""),
    origem: origemClienteEnum("origem").notNull().default("manual"),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    unique("clientes_empresa_id_uq").on(t.empresaId, t.id),
    check("clientes_telefone", sql`${t.telefone} is null or ${t.telefone} ~ '^[0-9]{10,15}$'`),
    check("clientes_documento", sql`${t.documento} is null or ${t.documento} ~ '^([0-9]{11}|[0-9]{14})$'`),
    index("clientes_empresa_nome_idx").on(t.empresaId, t.nome),
    // Um telefone identifica um cliente por empresa (é assim que o WhatsApp acha quem está falando).
    uniqueIndex("clientes_telefone_uq")
      .on(t.empresaId, t.telefone)
      .where(sql`${t.telefone} is not null and ${t.excluidoEm} is null`),
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
    clienteId: uuid("cliente_id"),
    origem: origemVendaEnum("origem").notNull().default("manual"),
    /**
     * null = entrou sozinha (WhatsApp, agenda…) e espera o check do dono. O padrão é "agora":
     * quem lança à mão já conferiu; os canais automáticos gravam null de propósito.
     */
    conferidoEm: timestamp("conferido_em", { withTimezone: true }).defaultNow(),
    conferidoPor: uuid("conferido_por").references(() => usuarios.id, { onDelete: "set null" }),
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
    foreignKey({
      name: "vendas_cliente_fk",
      columns: [t.empresaId, t.clienteId],
      foreignColumns: [clientes.empresaId, clientes.id],
    }),
    index("vendas_empresa_conferir_idx").on(t.empresaId).where(sql`${t.conferidoEm} is null and ${t.excluidoEm} is null`),
    index("vendas_empresa_cliente_idx").on(t.empresaId, t.clienteId),
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

/** Despesa cadastrada uma vez e gerada todo mês (ex.: aluguel todo dia 10). */
export const despesasRecorrentes = pgTable(
  "despesas_recorrentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    valorCentavos: centavos("valor_centavos").notNull(),
    categoriaId: uuid("categoria_id").notNull(),
    diaVencimento: integer("dia_vencimento").notNull(),
    /** Primeiro e último mês (AAAA-MM) em que a despesa é gerada; fim null = sem fim. */
    inicio: text("inicio").notNull(),
    fim: text("fim"),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: uuid("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("recorrentes_empresa_id_uq").on(t.empresaId, t.id),
    foreignKey({
      name: "recorrentes_categoria_fk",
      columns: [t.empresaId, t.categoriaId],
      foreignColumns: [categoriasDespesa.empresaId, categoriasDespesa.id],
    }),
    check("recorrentes_valor", sql`${t.valorCentavos} > 0`),
    check("recorrentes_dia", sql`${t.diaVencimento} between 1 and 31`),
    check("recorrentes_meses", sql`${t.inicio} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and (${t.fim} is null or ${t.fim} >= ${t.inicio})`),
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
    recorrenciaId: uuid("recorrencia_id"),
    /**
     * Chave dos lançamentos gerados pelo sistema ("recorrente:<id>:2026-10", "imposto:simples:2026-09"):
     * impede gerar duas vezes, mesmo que o usuário exclua o lançamento.
     */
    referencia: text("referencia"),
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
    unique("despesas_referencia_uq").on(t.empresaId, t.referencia),
    foreignKey({
      name: "despesas_recorrencia_fk",
      columns: [t.empresaId, t.recorrenciaId],
      foreignColumns: [despesasRecorrentes.empresaId, despesasRecorrentes.id],
    }),
  ],
);

// ─── Parâmetros fiscais (com vigência) ───────────────────────────────────────

/** Alíquotas, limites e valores definidos por lei. Nunca ficam no código. */
export const parametrosFiscais = pgTable(
  "parametros_fiscais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: text("chave").notNull(),
    /** pcm para percentuais, centavos para valores. */
    valor: bigint("valor", { mode: "number" }).notNull(),
    unidade: text("unidade").notNull(), // 'pcm' | 'centavos'
    descricao: text("descricao").notNull(),
    fonteLegal: text("fonte_legal"),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("parametros_chave_idx").on(t.chave, t.vigenciaInicio),
    check("parametros_vigencia", sql`${t.vigenciaFim} is null or ${t.vigenciaFim} >= ${t.vigenciaInicio}`),
  ],
);

/** Tabelas dos Anexos do Simples Nacional (LC 123/2006, Anexos I a V). */
export const simplesFaixas = pgTable(
  "simples_faixas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anexo: anexoEnum("anexo").notNull(),
    faixa: integer("faixa").notNull(),
    /** Limite superior da faixa (RBT12), inclusivo. */
    receitaAteCentavos: centavos("receita_ate_centavos").notNull(),
    aliquotaNominalPcm: integer("aliquota_nominal_pcm").notNull(),
    parcelaDeduzirCentavos: centavos("parcela_deduzir_centavos").notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"),
  },
  (t) => [
    unique("simples_faixas_uq").on(t.anexo, t.faixa, t.vigenciaInicio),
    check("sf_valores", sql`${t.receitaAteCentavos} > 0 and ${t.aliquotaNominalPcm} > 0 and ${t.parcelaDeduzirCentavos} >= 0`),
  ],
);

/** Valores que a empresa sobrescreve (ex.: RAT ajustado pelo FAP, alíquota de terceiros). */
export const empresaParametros = pgTable(
  "empresa_parametros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    chave: text("chave").notNull(),
    valor: bigint("valor", { mode: "number" }).notNull(),
    vigenciaInicio: date("vigencia_inicio").notNull(),
    vigenciaFim: date("vigencia_fim"),
    criadoEm: criadoEm(),
  },
  (t) => [
    unique("empresa_parametros_uq").on(t.empresaId, t.chave, t.vigenciaInicio),
    check("ep_vigencia", sql`${t.vigenciaFim} is null or ${t.vigenciaFim} >= ${t.vigenciaInicio}`),
  ],
);

// ─── Funcionários ────────────────────────────────────────────────────────────

export const funcionarios = pgTable(
  "funcionarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cargo: text("cargo").notNull().default(""),
    salarioBrutoCentavos: centavos("salario_bruto_centavos").notNull(),
    admissao: date("admissao").notNull(),
    desligamento: date("desligamento"),
    /** Valor que a empresa paga por mês (já descontada a parte do funcionário). */
    vtCentavos: centavos("vt_centavos").notNull().default(0),
    vrCentavos: centavos("vr_centavos").notNull().default(0),
    planoSaudeCentavos: centavos("plano_saude_centavos").notNull().default(0),
    outrosBeneficiosCentavos: centavos("outros_beneficios_centavos").notNull().default(0),
    /** Primeiro mês em que o urutau gera a folha (antes disso, o custo foi lançado à mão). */
    folhaDesde: text("folha_desde").notNull(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    unique("funcionarios_empresa_id_uq").on(t.empresaId, t.id),
    check("func_salario", sql`${t.salarioBrutoCentavos} > 0`),
    check(
      "func_beneficios",
      sql`${t.vtCentavos} >= 0 and ${t.vrCentavos} >= 0 and ${t.planoSaudeCentavos} >= 0 and ${t.outrosBeneficiosCentavos} >= 0`,
    ),
    check("func_datas", sql`${t.desligamento} is null or ${t.desligamento} >= ${t.admissao}`),
    check("func_folha_desde", sql`${t.folhaDesde} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/** Foto do custo de cada funcionário em cada mês: aumentos futuros não reescrevem o passado. */
export const folhaMensal = pgTable(
  "folha_mensal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    funcionarioId: uuid("funcionario_id").notNull(),
    competencia: text("competencia").notNull(), // AAAA-MM
    diasTrabalhados: integer("dias_trabalhados").notNull(),
    salario: centavos("salario").notNull(),
    fgts: centavos("fgts").notNull(),
    provisao13: centavos("provisao_13").notNull(),
    provisaoFerias: centavos("provisao_ferias").notNull(),
    fgtsProvisoes: centavos("fgts_provisoes").notNull(),
    inssPatronal: centavos("inss_patronal").notNull(),
    rat: centavos("rat").notNull(),
    terceiros: centavos("terceiros").notNull(),
    beneficios: centavos("beneficios").notNull(),
    custoTotal: centavos("custo_total").notNull(),
    /** Parte que sai do caixa no pagamento do mês (sem provisões de 13º e férias). */
    valorCaixa: centavos("valor_caixa").notNull(),
    vencimento: date("vencimento").notNull(),
    status: statusPagamentoEnum("status").notNull().default("a_pagar"),
    pagoEm: date("pago_em"),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("folha_func_comp_uq").on(t.empresaId, t.funcionarioId, t.competencia),
    foreignKey({
      name: "folha_funcionario_fk",
      columns: [t.empresaId, t.funcionarioId],
      foreignColumns: [funcionarios.empresaId, funcionarios.id],
    }).onDelete("cascade"),
    check("folha_pago_coerente", sql`(${t.status} = 'pago') = (${t.pagoEm} is not null)`),
    index("folha_empresa_comp_idx").on(t.empresaId, t.competencia),
  ],
);

/**
 * Pagamento de 13º ou férias. O custo já entrou no lucro mês a mês pelas reservas;
 * aqui registramos só a saída do caixa.
 */
export const pagamentosProvisao = pgTable(
  "pagamentos_provisao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    funcionarioId: uuid("funcionario_id").notNull(),
    tipo: tipoProvisaoEnum("tipo").notNull(),
    pagoEm: date("pago_em").notNull(),
    valorCentavos: centavos("valor_centavos").notNull(),
    descricao: text("descricao").notNull().default(""),
    criadoEm: criadoEm(),
  },
  (t) => [
    foreignKey({
      name: "provisao_funcionario_fk",
      columns: [t.empresaId, t.funcionarioId],
      foreignColumns: [funcionarios.empresaId, funcionarios.id],
    }).onDelete("cascade"),
    check("provisao_valor", sql`${t.valorCentavos} > 0`),
    index("provisao_empresa_data_idx").on(t.empresaId, t.pagoEm),
  ],
);

// ─── Dívidas ─────────────────────────────────────────────────────────────────

export const dividas = pgTable(
  "dividas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    credor: text("credor").notNull(),
    tipo: tipoDividaEnum("tipo").notNull(),
    valorOriginalCentavos: centavos("valor_original_centavos").notNull(),
    /** Saldo no momento do cadastro, a partir do qual as parcelas restantes são geradas. */
    saldoDevedorCentavos: centavos("saldo_devedor_centavos").notNull(),
    jurosMensaisPcm: integer("juros_mensais_pcm").notNull(),
    numParcelas: integer("num_parcelas").notNull(),
    valorParcelaCentavos: centavos("valor_parcela_centavos").notNull(),
    /** true se o valor da parcela veio do contrato; false se calculado pela tabela Price. */
    parcelaInformada: boolean("parcela_informada").notNull().default(false),
    diaVencimento: integer("dia_vencimento").notNull(),
    primeiroVencimento: date("primeiro_vencimento").notNull(),
    observacao: text("observacao").notNull().default(""),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    unique("dividas_empresa_id_uq").on(t.empresaId, t.id),
    check("dividas_valores", sql`${t.valorOriginalCentavos} > 0 and ${t.saldoDevedorCentavos} > 0 and ${t.valorParcelaCentavos} > 0`),
    check("dividas_juros", sql`${t.jurosMensaisPcm} >= 0 and ${t.jurosMensaisPcm} <= 100000`),
    check("dividas_parcelas", sql`${t.numParcelas} between 1 and 600`),
    check("dividas_dia", sql`${t.diaVencimento} between 1 and 31`),
  ],
);

export const parcelasDivida = pgTable(
  "parcelas_divida",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    dividaId: uuid("divida_id").notNull(),
    numero: integer("numero").notNull(),
    vencimento: date("vencimento").notNull(),
    valor: centavos("valor").notNull(),
    /** Despesa do mês do vencimento. */
    juros: centavos("juros").notNull(),
    /** Reduz o saldo devedor; não é despesa. */
    amortizacao: centavos("amortizacao").notNull(),
    saldoApos: centavos("saldo_apos").notNull(),
    status: statusPagamentoEnum("status").notNull().default("a_pagar"),
    pagoEm: date("pago_em"),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique("parcelas_divida_numero_uq").on(t.dividaId, t.numero),
    foreignKey({
      name: "parcelas_divida_fk",
      columns: [t.empresaId, t.dividaId],
      foreignColumns: [dividas.empresaId, dividas.id],
    }).onDelete("cascade"),
    check("parcelas_valores", sql`${t.valor} = ${t.juros} + ${t.amortizacao} and ${t.juros} >= 0 and ${t.amortizacao} >= 0`),
    check("parcelas_pago_coerente", sql`(${t.status} = 'pago') = (${t.pagoEm} is not null)`),
    index("parcelas_empresa_venc_idx").on(t.empresaId, t.vencimento),
  ],
);

// ─── Auditoria e tarefas ─────────────────────────────────────────────────────

/** Quem fez o quê. O agente do WhatsApp e o painel Urutau também registram aqui. */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null em ações fora de uma empresa (ex.: admin redefiniu a senha de alguém). */
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    ator: atorEnum("ator").notNull(),
    acao: text("acao").notNull(),
    entidade: text("entidade"),
    entidadeId: uuid("entidade_id"),
    dados: jsonb("dados").$type<Record<string, unknown>>(),
    criadoEm: criadoEm(),
  },
  (t) => [index("auditoria_empresa_idx").on(t.empresaId, t.criadoEm)],
);

/**
 * Trabalho feito fora de uma tela (rotinas diárias, depois mensagens do WhatsApp e lembretes).
 * O cron pega as pendentes com FOR UPDATE SKIP LOCKED; `chave` impede enfileirar a mesma coisa duas vezes.
 */
export const tarefas = pgTable(
  "tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    dados: jsonb("dados").$type<Record<string, unknown>>().notNull().default({}),
    chave: text("chave").unique(),
    status: statusTarefaEnum("status").notNull().default("pendente"),
    executarEm: timestamp("executar_em", { withTimezone: true }).notNull().defaultNow(),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoErro: text("ultimo_erro"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("tarefas_fila_idx").on(t.status, t.executarEm)],
);

export type TipoDivida =(typeof tipoDividaEnum.enumValues)[number];
export type Papel = (typeof papelEnum.enumValues)[number];
export type Regime = (typeof regimeEnum.enumValues)[number];
export type Atividade = (typeof atividadeEnum.enumValues)[number];
export type FormaPagamento = (typeof formaPagamentoEnum.enumValues)[number];
export type ChaveCategoria = (typeof chaveCategoriaEnum.enumValues)[number];
export type Empresa = typeof empresas.$inferSelect;
export type Perfil = (typeof perfilEnum.enumValues)[number];
export type Modulo = (typeof moduloEnum.enumValues)[number];
export type OrigemVenda = (typeof origemVendaEnum.enumValues)[number];
