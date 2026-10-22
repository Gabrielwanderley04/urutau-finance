-- Tabelas fiscais da Fase 3. Percentuais em pcm (1% = 1000); valores em centavos.
-- Para mudar uma regra: feche a vigência da linha atual (vigencia_fim) e insira a nova.

-- Simples Nacional — LC 123/2006, Anexos I a V (redação da LC 155/2016, vigente desde 2018).
INSERT INTO "simples_faixas" ("anexo", "faixa", "receita_ate_centavos", "aliquota_nominal_pcm", "parcela_deduzir_centavos", "vigencia_inicio") VALUES
  ('I', 1, 18000000, 4000, 0, '2018-01-01'),
  ('I', 2, 36000000, 7300, 594000, '2018-01-01'),
  ('I', 3, 72000000, 9500, 1386000, '2018-01-01'),
  ('I', 4, 180000000, 10700, 2250000, '2018-01-01'),
  ('I', 5, 360000000, 14300, 8730000, '2018-01-01'),
  ('I', 6, 480000000, 19000, 37800000, '2018-01-01'),
  ('II', 1, 18000000, 4500, 0, '2018-01-01'),
  ('II', 2, 36000000, 7800, 594000, '2018-01-01'),
  ('II', 3, 72000000, 10000, 1386000, '2018-01-01'),
  ('II', 4, 180000000, 11200, 2250000, '2018-01-01'),
  ('II', 5, 360000000, 14700, 8550000, '2018-01-01'),
  ('II', 6, 480000000, 30000, 72000000, '2018-01-01'),
  ('III', 1, 18000000, 6000, 0, '2018-01-01'),
  ('III', 2, 36000000, 11200, 936000, '2018-01-01'),
  ('III', 3, 72000000, 13500, 1764000, '2018-01-01'),
  ('III', 4, 180000000, 16000, 3564000, '2018-01-01'),
  ('III', 5, 360000000, 21000, 12564000, '2018-01-01'),
  ('III', 6, 480000000, 33000, 64800000, '2018-01-01'),
  ('IV', 1, 18000000, 4500, 0, '2018-01-01'),
  ('IV', 2, 36000000, 9000, 810000, '2018-01-01'),
  ('IV', 3, 72000000, 10200, 1242000, '2018-01-01'),
  ('IV', 4, 180000000, 14000, 3978000, '2018-01-01'),
  ('IV', 5, 360000000, 22000, 18378000, '2018-01-01'),
  ('IV', 6, 480000000, 33000, 82800000, '2018-01-01'),
  ('V', 1, 18000000, 15500, 0, '2018-01-01'),
  ('V', 2, 36000000, 18000, 450000, '2018-01-01'),
  ('V', 3, 72000000, 19500, 990000, '2018-01-01'),
  ('V', 4, 180000000, 20500, 1710000, '2018-01-01'),
  ('V', 5, 360000000, 23000, 6210000, '2018-01-01'),
  ('V', 6, 480000000, 30500, 54000000, '2018-01-01');
--> statement-breakpoint
INSERT INTO "parametros_fiscais" ("chave", "valor", "unidade", "descricao", "fonte_legal", "vigencia_inicio", "vigencia_fim") VALUES
  -- Simples Nacional
  ('simples_limite_anual', 480000000, 'centavos', 'Limite de receita bruta anual do Simples Nacional', 'LC 123/2006, art. 3º, II', '2018-01-01', NULL),
  ('simples_sublimite', 360000000, 'centavos', 'Sublimite para ICMS/ISS dentro do DAS', 'LC 123/2006, art. 19', '2018-01-01', NULL),
  ('fator_r_minimo', 28000, 'pcm', 'Fator R mínimo (folha ÷ receita) para tributar pelo Anexo III', 'LC 123/2006, art. 18, §5º-J', '2018-01-01', NULL),
  -- MEI: DAS = 5% do salário mínimo (INSS) + R$ 1 (ICMS) e/ou R$ 5 (ISS)
  ('mei_das_comercio', 7690, 'centavos', 'DAS mensal do MEI — comércio/indústria', 'LC 123/2006, art. 18-A, §3º', '2025-01-01', '2025-12-31'),
  ('mei_das_servicos', 8090, 'centavos', 'DAS mensal do MEI — serviços', 'LC 123/2006, art. 18-A, §3º', '2025-01-01', '2025-12-31'),
  ('mei_das_ambos', 8190, 'centavos', 'DAS mensal do MEI — comércio e serviços', 'LC 123/2006, art. 18-A, §3º', '2025-01-01', '2025-12-31'),
  ('mei_das_comercio', 8205, 'centavos', 'DAS mensal do MEI — comércio/indústria', 'LC 123/2006, art. 18-A, §3º', '2026-01-01', '2026-12-31'),
  ('mei_das_servicos', 8605, 'centavos', 'DAS mensal do MEI — serviços', 'LC 123/2006, art. 18-A, §3º', '2026-01-01', '2026-12-31'),
  ('mei_das_ambos', 8705, 'centavos', 'DAS mensal do MEI — comércio e serviços', 'LC 123/2006, art. 18-A, §3º', '2026-01-01', '2026-12-31'),
  ('mei_limite_anual', 8100000, 'centavos', 'Limite anual de faturamento do MEI', 'LC 123/2006, art. 18-A, §1º', '2018-01-01', NULL),
  ('mei_alerta', 80000, 'pcm', 'Percentual do limite anual que dispara o alerta', 'urutau', '2018-01-01', NULL),
  -- Lucro Presumido
  ('lp_presuncao_irpj_comercio', 8000, 'pcm', 'Presunção do IRPJ — comércio', 'Lei 9.249/1995, art. 15', '1996-01-01', NULL),
  ('lp_presuncao_irpj_servico', 32000, 'pcm', 'Presunção do IRPJ — serviços em geral', 'Lei 9.249/1995, art. 15, §1º, III', '1996-01-01', NULL),
  ('lp_presuncao_csll_comercio', 12000, 'pcm', 'Presunção da CSLL — comércio', 'Lei 9.249/1995, art. 20', '1996-01-01', NULL),
  ('lp_presuncao_csll_servico', 32000, 'pcm', 'Presunção da CSLL — serviços em geral', 'Lei 9.249/1995, art. 20, III', '2003-09-01', NULL),
  ('lp_irpj', 15000, 'pcm', 'Alíquota do IRPJ', 'Lei 9.249/1995, art. 3º', '1996-01-01', NULL),
  ('lp_irpj_adicional', 10000, 'pcm', 'Adicional do IRPJ', 'Lei 9.249/1995, art. 3º, §1º', '1996-01-01', NULL),
  ('lp_irpj_adicional_limite_mensal', 2000000, 'centavos', 'Parcela da base mensal isenta do adicional (R$ 60 mil por trimestre)', 'Lei 9.430/1996, art. 4º', '1997-01-01', NULL),
  ('lp_csll', 9000, 'pcm', 'Alíquota da CSLL', 'Lei 7.689/1988', '2000-01-01', NULL),
  ('pis_cumulativo', 650, 'pcm', 'PIS no regime cumulativo (até a CBS substituir)', 'Lei 9.718/1998', '2000-01-01', NULL),
  ('cofins_cumulativo', 3000, 'pcm', 'Cofins no regime cumulativo (até a CBS substituir)', 'Lei 9.718/1998', '2000-01-01', NULL),
  -- LC 224/2025: acréscimo de 10% nos percentuais de presunção sobre a receita anual acima de R$ 5 milhões
  ('lc224_limite_anual', 500000000, 'centavos', 'Receita anual a partir da qual a presunção é acrescida', 'LC 224/2025', '1996-01-01', NULL),
  ('lc224_acrescimo_irpj', 0, 'pcm', 'Acréscimo sobre a presunção do IRPJ (antes da LC 224)', 'LC 224/2025', '1996-01-01', '2025-12-31'),
  ('lc224_acrescimo_irpj', 10000, 'pcm', 'Acréscimo sobre a presunção do IRPJ', 'LC 224/2025', '2026-01-01', NULL),
  ('lc224_acrescimo_csll', 0, 'pcm', 'Acréscimo sobre a presunção da CSLL (antes da LC 224)', 'LC 224/2025', '1996-01-01', '2026-03-31'),
  ('lc224_acrescimo_csll', 10000, 'pcm', 'Acréscimo sobre a presunção da CSLL (noventena)', 'LC 224/2025', '2026-04-01', NULL);
