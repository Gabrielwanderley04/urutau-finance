ALTER TABLE "receitas_historicas" ALTER COLUMN "receita_centavos" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "receitas_historicas" ALTER COLUMN "receita_centavos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receitas_historicas" ALTER COLUMN "folha_centavos" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "receitas_historicas" ALTER COLUMN "folha_centavos" DROP NOT NULL;