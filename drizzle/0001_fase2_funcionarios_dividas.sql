CREATE TYPE "public"."status_pagamento" AS ENUM('pago', 'a_pagar');--> statement-breakpoint
CREATE TYPE "public"."tipo_divida" AS ENUM('emprestimo', 'financiamento', 'fornecedor', 'imposto_parcelado', 'cartao', 'outro');--> statement-breakpoint
CREATE TABLE "dividas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"credor" text NOT NULL,
	"tipo" "tipo_divida" NOT NULL,
	"valor_original_centavos" bigint NOT NULL,
	"saldo_devedor_centavos" bigint NOT NULL,
	"juros_mensais_pcm" integer NOT NULL,
	"num_parcelas" integer NOT NULL,
	"valor_parcela_centavos" bigint NOT NULL,
	"parcela_informada" boolean DEFAULT false NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"primeiro_vencimento" date NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "dividas_empresa_id_uq" UNIQUE("empresa_id","id"),
	CONSTRAINT "dividas_valores" CHECK ("dividas"."valor_original_centavos" > 0 and "dividas"."saldo_devedor_centavos" > 0 and "dividas"."valor_parcela_centavos" > 0),
	CONSTRAINT "dividas_juros" CHECK ("dividas"."juros_mensais_pcm" >= 0 and "dividas"."juros_mensais_pcm" <= 100000),
	CONSTRAINT "dividas_parcelas" CHECK ("dividas"."num_parcelas" between 1 and 600),
	CONSTRAINT "dividas_dia" CHECK ("dividas"."dia_vencimento" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "empresa_parametros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"valor" bigint NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_parametros_uq" UNIQUE("empresa_id","chave","vigencia_inicio"),
	CONSTRAINT "ep_vigencia" CHECK ("empresa_parametros"."vigencia_fim" is null or "empresa_parametros"."vigencia_fim" >= "empresa_parametros"."vigencia_inicio")
);
--> statement-breakpoint
CREATE TABLE "folha_mensal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"dias_trabalhados" integer NOT NULL,
	"salario" bigint NOT NULL,
	"fgts" bigint NOT NULL,
	"provisao_13" bigint NOT NULL,
	"provisao_ferias" bigint NOT NULL,
	"fgts_provisoes" bigint NOT NULL,
	"inss_patronal" bigint NOT NULL,
	"rat" bigint NOT NULL,
	"terceiros" bigint NOT NULL,
	"beneficios" bigint NOT NULL,
	"custo_total" bigint NOT NULL,
	"valor_caixa" bigint NOT NULL,
	"vencimento" date NOT NULL,
	"status" "status_pagamento" DEFAULT 'a_pagar' NOT NULL,
	"pago_em" date,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folha_func_comp_uq" UNIQUE("empresa_id","funcionario_id","competencia"),
	CONSTRAINT "folha_pago_coerente" CHECK (("folha_mensal"."status" = 'pago') = ("folha_mensal"."pago_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cargo" text DEFAULT '' NOT NULL,
	"salario_bruto_centavos" bigint NOT NULL,
	"admissao" date NOT NULL,
	"desligamento" date,
	"vt_centavos" bigint DEFAULT 0 NOT NULL,
	"vr_centavos" bigint DEFAULT 0 NOT NULL,
	"plano_saude_centavos" bigint DEFAULT 0 NOT NULL,
	"outros_beneficios_centavos" bigint DEFAULT 0 NOT NULL,
	"folha_desde" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "funcionarios_empresa_id_uq" UNIQUE("empresa_id","id"),
	CONSTRAINT "func_salario" CHECK ("funcionarios"."salario_bruto_centavos" > 0),
	CONSTRAINT "func_beneficios" CHECK ("funcionarios"."vt_centavos" >= 0 and "funcionarios"."vr_centavos" >= 0 and "funcionarios"."plano_saude_centavos" >= 0 and "funcionarios"."outros_beneficios_centavos" >= 0),
	CONSTRAINT "func_datas" CHECK ("funcionarios"."desligamento" is null or "funcionarios"."desligamento" >= "funcionarios"."admissao"),
	CONSTRAINT "func_folha_desde" CHECK ("funcionarios"."folha_desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "parametros_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"valor" bigint NOT NULL,
	"unidade" text NOT NULL,
	"descricao" text NOT NULL,
	"fonte_legal" text,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parametros_vigencia" CHECK ("parametros_fiscais"."vigencia_fim" is null or "parametros_fiscais"."vigencia_fim" >= "parametros_fiscais"."vigencia_inicio")
);
--> statement-breakpoint
CREATE TABLE "parcelas_divida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"divida_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"vencimento" date NOT NULL,
	"valor" bigint NOT NULL,
	"juros" bigint NOT NULL,
	"amortizacao" bigint NOT NULL,
	"saldo_apos" bigint NOT NULL,
	"status" "status_pagamento" DEFAULT 'a_pagar' NOT NULL,
	"pago_em" date,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parcelas_divida_numero_uq" UNIQUE("divida_id","numero"),
	CONSTRAINT "parcelas_valores" CHECK ("parcelas_divida"."valor" = "parcelas_divida"."juros" + "parcelas_divida"."amortizacao" and "parcelas_divida"."juros" >= 0 and "parcelas_divida"."amortizacao" >= 0),
	CONSTRAINT "parcelas_pago_coerente" CHECK (("parcelas_divida"."status" = 'pago') = ("parcelas_divida"."pago_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_parametros" ADD CONSTRAINT "empresa_parametros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_mensal" ADD CONSTRAINT "folha_mensal_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folha_mensal" ADD CONSTRAINT "folha_funcionario_fk" FOREIGN KEY ("empresa_id","funcionario_id") REFERENCES "public"."funcionarios"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_divida" ADD CONSTRAINT "parcelas_divida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_divida" ADD CONSTRAINT "parcelas_divida_fk" FOREIGN KEY ("empresa_id","divida_id") REFERENCES "public"."dividas"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folha_empresa_comp_idx" ON "folha_mensal" USING btree ("empresa_id","competencia");--> statement-breakpoint
CREATE INDEX "parametros_chave_idx" ON "parametros_fiscais" USING btree ("chave","vigencia_inicio");--> statement-breakpoint
CREATE INDEX "parcelas_empresa_venc_idx" ON "parcelas_divida" USING btree ("empresa_id","vencimento");