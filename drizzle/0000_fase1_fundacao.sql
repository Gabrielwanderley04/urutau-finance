CREATE TYPE "public"."anexo_simples" AS ENUM('I', 'II', 'III', 'IV', 'V');--> statement-breakpoint
CREATE TYPE "public"."atividade" AS ENUM('comercio', 'servicos', 'ambos');--> statement-breakpoint
CREATE TYPE "public"."chave_categoria" AS ENUM('contas_fixas', 'funcionarios', 'mercadorias', 'impostos', 'pro_labore', 'marketing', 'juros_tarifas', 'outras');--> statement-breakpoint
CREATE TYPE "public"."comportamento_custo" AS ENUM('fixo', 'variavel');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento" AS ENUM('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'transferencia', 'outro');--> statement-breakpoint
CREATE TYPE "public"."natureza_receita" AS ENUM('comercio', 'servico');--> statement-breakpoint
CREATE TYPE "public"."origem_despesa" AS ENUM('manual', 'recorrente');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('dono', 'colaborador', 'contador');--> statement-breakpoint
CREATE TYPE "public"."regime_tributario" AS ENUM('mei', 'simples', 'presumido', 'real');--> statement-breakpoint
CREATE TYPE "public"."status_despesa" AS ENUM('pago', 'a_pagar');--> statement-breakpoint
CREATE TYPE "public"."status_venda" AS ENUM('recebido', 'a_receber');--> statement-breakpoint
CREATE TYPE "public"."tratamento_mercadorias" AS ENUM('despesa_na_compra', 'cmv');--> statement-breakpoint
CREATE TABLE "categorias_despesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"chave_sistema" "chave_categoria",
	"comportamento" "comportamento_custo" NOT NULL,
	"entra_no_lucro" boolean DEFAULT true NOT NULL,
	"entra_na_folha_fator_r" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_empresa_id_uq" UNIQUE("empresa_id","id"),
	CONSTRAINT "categorias_chave_uq" UNIQUE("empresa_id","chave_sistema")
);
--> statement-breakpoint
CREATE TABLE "despesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"categoria_id" uuid NOT NULL,
	"status" "status_despesa" NOT NULL,
	"vencimento" date NOT NULL,
	"pago_em" date,
	"origem" "origem_despesa" DEFAULT 'manual' NOT NULL,
	"recorrencia_id" uuid,
	"compra_id" uuid,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "despesas_valor_positivo" CHECK ("despesas"."valor_centavos" > 0),
	CONSTRAINT "despesas_pago_coerente" CHECK (("despesas"."status" = 'pago') = ("despesas"."pago_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "empresa_usuarios" (
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" "papel" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_usuarios_empresa_id_usuario_id_pk" PRIMARY KEY("empresa_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"atividade" "atividade" NOT NULL,
	"cidade" text,
	"uf" text,
	"regime" "regime_tributario" NOT NULL,
	"anexo_comercio" "anexo_simples",
	"anexo_servicos" "anexo_simples",
	"sujeito_fator_r" boolean DEFAULT false NOT NULL,
	"aliquota_iss_pcm" integer,
	"aliquota_icms_pcm" integer,
	"inicio_atividade" date,
	"tratamento_mercadorias" "tratamento_mercadorias" DEFAULT 'despesa_na_compra' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cnpj_formato" CHECK ("empresas"."cnpj" is null or "empresas"."cnpj" ~ '^[0-9]{14}$'),
	CONSTRAINT "empresas_uf_formato" CHECK ("empresas"."uf" is null or "empresas"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "empresas_anexo_comercio" CHECK ("empresas"."anexo_comercio" is null or "empresas"."anexo_comercio" in ('I','II')),
	CONSTRAINT "empresas_anexo_servicos" CHECK ("empresas"."anexo_servicos" is null or "empresas"."anexo_servicos" in ('III','IV','V'))
);
--> statement-breakpoint
CREATE TABLE "fontes_receita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"natureza" "natureza_receita" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fontes_empresa_id_uq" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "receitas_historicas" (
	"empresa_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"receita_centavos" bigint DEFAULT 0 NOT NULL,
	"folha_centavos" bigint DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receitas_historicas_empresa_id_competencia_pk" PRIMARY KEY("empresa_id","competencia"),
	CONSTRAINT "rh_competencia" CHECK ("receitas_historicas"."competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "rh_valores" CHECK ("receitas_historicas"."receita_centavos" >= 0 and "receitas_historicas"."folha_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"superadmin" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"fonte_receita_id" uuid NOT NULL,
	"forma_pagamento" "forma_pagamento" NOT NULL,
	"status" "status_venda" NOT NULL,
	"data_recebimento" date NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "vendas_valor_positivo" CHECK ("vendas"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "categorias_despesa" ADD CONSTRAINT "categorias_despesa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_categoria_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categorias_despesa"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_usuarios" ADD CONSTRAINT "empresa_usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_usuarios" ADD CONSTRAINT "empresa_usuarios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fontes_receita" ADD CONSTRAINT "fontes_receita_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receitas_historicas" ADD CONSTRAINT "receitas_historicas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_fonte_fk" FOREIGN KEY ("empresa_id","fonte_receita_id") REFERENCES "public"."fontes_receita"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "despesas_empresa_data_idx" ON "despesas" USING btree ("empresa_id","data");--> statement-breakpoint
CREATE INDEX "despesas_empresa_venc_idx" ON "despesas" USING btree ("empresa_id","vencimento");--> statement-breakpoint
CREATE INDEX "eu_usuario_idx" ON "empresa_usuarios" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "vendas_empresa_data_idx" ON "vendas" USING btree ("empresa_id","data");--> statement-breakpoint
CREATE INDEX "vendas_empresa_receb_idx" ON "vendas" USING btree ("empresa_id","data_recebimento");