-- Parâmetros da folha de pagamento. Percentuais em pcm (1% = 1000).
-- Para mudar uma regra: feche a vigência da linha atual (vigencia_fim) e insira a nova.
INSERT INTO "parametros_fiscais" ("chave", "valor", "unidade", "descricao", "fonte_legal", "vigencia_inicio") VALUES
  ('fgts', 8000, 'pcm', 'FGTS sobre a remuneração', 'Lei 8.036/1990, art. 15', '1990-05-11'),
  ('inss_patronal', 20000, 'pcm', 'INSS patronal (CPP) sobre a folha', 'Lei 8.212/1991, art. 22, I', '1991-07-24'),
  ('rat', 2000, 'pcm', 'RAT/GILRAT padrão (1%, 2% ou 3% conforme o risco; ajustável pelo FAP)', 'Lei 8.212/1991, art. 22, II', '1991-07-24'),
  ('terceiros', 5800, 'pcm', 'Outras entidades (salário-educação, INCRA, Sistema S, SEBRAE) — comércio e serviços', 'IN RFB 2.110/2022, Anexo II', '1991-07-24'),
  ('mei_cpp', 3000, 'pcm', 'CPP do MEI com empregado', 'LC 123/2006, art. 18-C', '2009-07-01');
