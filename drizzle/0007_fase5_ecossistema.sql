CREATE TYPE "public"."ator" AS ENUM('usuario', 'admin', 'agente', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."modulo" AS ENUM('financas', 'agenda', 'estoque', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."origem_cliente" AS ENUM('manual', 'whatsapp', 'site', 'balcao', 'indicacao');--> statement-breakpoint
CREATE TYPE "public"."origem_venda" AS ENUM('manual', 'whatsapp', 'agenda', 'balcao', 'site');--> statement-breakpoint
CREATE TYPE "public"."perfil_empresa" AS ENUM('financas', 'revenda_veiculos', 'consultorio', 'varejo', 'servicos', 'alimentacao');--> statement-breakpoint
CREATE TYPE "public"."status_tarefa" AS ENUM('pendente', 'executando', 'concluida', 'falhou');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"usuario_id" uuid,
	"ator" "ator" NOT NULL,
	"acao" text NOT NULL,
	"entidade" text,
	"entidade_id" uuid,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"documento" text,
	"observacao" text DEFAULT '' NOT NULL,
	"origem" "origem_cliente" DEFAULT 'manual' NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "clientes_empresa_id_uq" UNIQUE("empresa_id","id"),
	CONSTRAINT "clientes_telefone" CHECK ("clientes"."telefone" is null or "clientes"."telefone" ~ '^[0-9]{10,15}$'),
	CONSTRAINT "clientes_documento" CHECK ("clientes"."documento" is null or "clientes"."documento" ~ '^([0-9]{11}|[0-9]{14})$')
);
--> statement-breakpoint
CREATE TABLE "empresa_modulos" (
	"empresa_id" uuid NOT NULL,
	"modulo" "modulo" NOT NULL,
	"ativo" boolean NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_modulos_empresa_id_modulo_pk" PRIMARY KEY("empresa_id","modulo")
);
--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"tipo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chave" text,
	"status" "status_tarefa" DEFAULT 'pendente' NOT NULL,
	"executar_em" timestamp with time zone DEFAULT now() NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tarefas_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "perfil" "perfil_empresa" DEFAULT 'financas' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "origem" "origem_venda" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "conferido_em" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN "conferido_por" uuid;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_modulos" ADD CONSTRAINT "empresa_modulos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_empresa_idx" ON "auditoria" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE INDEX "clientes_empresa_nome_idx" ON "clientes" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_telefone_uq" ON "clientes" USING btree ("empresa_id","telefone") WHERE "clientes"."telefone" is not null and "clientes"."excluido_em" is null;--> statement-breakpoint
CREATE INDEX "tarefas_fila_idx" ON "tarefas" USING btree ("status","executar_em");--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_conferido_por_usuarios_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendas_empresa_conferir_idx" ON "vendas" USING btree ("empresa_id") WHERE "vendas"."conferido_em" is null and "vendas"."excluido_em" is null;--> statement-breakpoint
CREATE INDEX "vendas_empresa_cliente_idx" ON "vendas" USING btree ("empresa_id","cliente_id");--> statement-breakpoint
-- Tudo o que já existia foi lançado à mão: conferido quando foi criado.
UPDATE "vendas" SET "conferido_em" = "criado_em", "conferido_por" = "criado_por";
