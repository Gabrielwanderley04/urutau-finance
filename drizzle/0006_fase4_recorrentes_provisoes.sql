CREATE TYPE "public"."tipo_provisao" AS ENUM('decimo_terceiro', 'ferias');--> statement-breakpoint
ALTER TYPE "public"."origem_despesa" ADD VALUE 'imposto';--> statement-breakpoint
CREATE TABLE "despesas_recorrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"categoria_id" uuid NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"inicio" text NOT NULL,
	"fim" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recorrentes_empresa_id_uq" UNIQUE("empresa_id","id"),
	CONSTRAINT "recorrentes_valor" CHECK ("despesas_recorrentes"."valor_centavos" > 0),
	CONSTRAINT "recorrentes_dia" CHECK ("despesas_recorrentes"."dia_vencimento" between 1 and 31),
	CONSTRAINT "recorrentes_meses" CHECK ("despesas_recorrentes"."inicio" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and ("despesas_recorrentes"."fim" is null or "despesas_recorrentes"."fim" >= "despesas_recorrentes"."inicio"))
);
--> statement-breakpoint
CREATE TABLE "pagamentos_provisao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"funcionario_id" uuid NOT NULL,
	"tipo" "tipo_provisao" NOT NULL,
	"pago_em" date NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provisao_valor" CHECK ("pagamentos_provisao"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "despesas" ADD COLUMN "referencia" text;--> statement-breakpoint
ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "despesas_recorrentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "despesas_recorrentes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "recorrentes_categoria_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categorias_despesa"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_provisao" ADD CONSTRAINT "pagamentos_provisao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_provisao" ADD CONSTRAINT "provisao_funcionario_fk" FOREIGN KEY ("empresa_id","funcionario_id") REFERENCES "public"."funcionarios"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provisao_empresa_data_idx" ON "pagamentos_provisao" USING btree ("empresa_id","pago_em");--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_recorrencia_fk" FOREIGN KEY ("empresa_id","recorrencia_id") REFERENCES "public"."despesas_recorrentes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_referencia_uq" UNIQUE("empresa_id","referencia");