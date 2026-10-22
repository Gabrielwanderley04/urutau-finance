CREATE TABLE "simples_faixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anexo" "anexo_simples" NOT NULL,
	"faixa" integer NOT NULL,
	"receita_ate_centavos" bigint NOT NULL,
	"aliquota_nominal_pcm" integer NOT NULL,
	"parcela_deduzir_centavos" bigint NOT NULL,
	"vigencia_inicio" date NOT NULL,
	"vigencia_fim" date,
	CONSTRAINT "simples_faixas_uq" UNIQUE("anexo","faixa","vigencia_inicio"),
	CONSTRAINT "sf_valores" CHECK ("simples_faixas"."receita_ate_centavos" > 0 and "simples_faixas"."aliquota_nominal_pcm" > 0 and "simples_faixas"."parcela_deduzir_centavos" >= 0)
);
