# urutau gestão

Gestão financeira simples para pequenas empresas brasileiras de comércio e serviços.
Mostra ao dono, numa tela só, quanto a empresa faturou, gastou, lucrou, quanto deve e
quanto deve pagar de imposto no mês.

## Rodando localmente

Pré-requisitos: Node 22+ e Postgres 16 (ou `docker compose up -d`).

```bash
cp .env.example .env      # ajuste DATABASE_URL e TEST_DATABASE_URL
npm install
npm run db:reset          # zera o banco, aplica migrações e cria a empresa de exemplo
npm run dev               # http://localhost:3000
```

Acessos de exemplo (senha `urutau123`):

| E-mail | Papel | O que vê |
|---|---|---|
| `dono@urutau.dev` | Dono | Tudo; tem também uma segunda empresa (MEI) |
| `colaborador@urutau.dev` | Colaborador | Lança vendas/despesas e vê só o que lançou |
| `contador@urutau.dev` | Contador | Painel e lançamentos, somente leitura |

Empresas de exemplo do `dono@`: **Padaria e Café Urutau** (Simples, Anexos I e III, com funcionários e dívidas),
**Marina Doces** (MEI perto do limite anual), **Estúdio Urutau Design** (Simples Anexo V com Fator R, que passa
para o Anexo III depois de contratar) e **Urutau Manutenção Industrial** (Lucro Presumido, com adicional do IRPJ e encargos).

## Testes

```bash
npm test        # unitários + integração com Postgres (usa TEST_DATABASE_URL, recria o schema)
npm run lint    # checagem de tipos
```

## Decisões de base

- **Dinheiro em centavos** (`bigint` no banco, inteiro no TS). Percentuais em **pcm** (1% = 1.000).
  Nenhum float em cálculo; arredondamento uma única vez, no fim, com divisão inteira (`src/lib/dinheiro.ts`).
- **Multiempresa**: toda tabela de negócio tem `empresa_id`, e as referências usam chave composta
  `(empresa_id, id)`, então o próprio banco recusa misturar dados de empresas diferentes.
  Todo acesso passa por `exigirAcesso` / `exigirPermissao` (`src/lib/servidor/acesso.ts`).
- **Papéis**: matriz em `src/lib/permissoes.ts`.
- **Cálculos são funções puras** em `src/lib/calculos/`, testadas sem banco.
- **Lucro × caixa**: lucro usa a data da despesa/venda (competência); caixa usa a data em que o dinheiro
  entrou ou saiu.
- **Imposto não conta duas vezes**: a categoria "Impostos sobre vendas" (`entra_no_lucro = false`)
  aparece só no caixa, porque o lucro desconta o imposto estimado.
- **Ponto de equilíbrio**: cada categoria é fixa ou variável; `PE = fixas × faturamento ÷ (faturamento − variáveis − impostos)`.
- **Parâmetros com vigência**: FGTS, INSS patronal, RAT, terceiros e CPP do MEI ficam em `parametros_fiscais`
  (com início e fim de vigência). A empresa pode sobrescrever valores em `empresa_parametros` (ex.: RAT ajustado pelo FAP).
- **Folha mensal**: cada funcionário gera uma linha por mês em `folha_mensal` (foto do custo). Meses passados ficam
  congelados; o mês atual é recalculado enquanto não for pago. `folha_desde` evita duplicar salários já lançados à mão.
  Custo = salário + FGTS + 13º (÷12) + férias com 1/3 (÷9) + FGTS das reservas + encargos (se o regime exigir) + benefícios.
  No caixa entram só salário, FGTS, encargos sobre o salário e benefícios: as reservas saem quando o 13º e as férias forem pagos.
- **Dívidas**: parcelas pela tabela Price, calculadas com frações exatas (BigInt). Os juros são despesa no mês do vencimento;
  a amortização só reduz o saldo e o caixa. O banco garante `valor = juros + amortização` em cada parcela.
- **Impostos** (`src/lib/calculos/{simples,mei,presumido,impostos}.ts`), sempre com o aviso "Valor estimado. Confirme com o seu contador.":
  - *Simples*: RBT12 = soma dos 12 meses anteriores (no início de atividade, mês × 12 ou média × 12, como na
    Resolução CGSN 140). Imposto = receita × (RBT12 × nominal − parcela a deduzir) ÷ RBT12, em fração exata.
    Cada natureza (comércio/serviço) usa o seu anexo com o mesmo RBT12. Fator R = folha 12 meses ÷ RBT12
    (folha = salários + FGTS + INSS patronal + 13º pela reserva mensal + pró-labore); ≥ 28% → Anexo III.
  - *MEI*: DAS fixo por atividade e por ano; alerta a partir de 80% do limite (proporcional no ano de abertura).
  - *Lucro Presumido*: presunção 8%/32% (IRPJ) e 12%/32% (CSLL), IRPJ 15% + adicional 10% acima de R$ 20 mil/mês,
    CSLL 9%, PIS 0,65%, Cofins 3%, ISS/ICMS da empresa. Acréscimo da LC 224/2025 só sobre a receita anual acima de R$ 5 milhões.
    A tela mostra também a apuração do trimestre até o mês.
  - *Lucro Real*: "Cálculo disponível em breve. Consulte seu contador."
  - Tabelas em `simples_faixas` e `parametros_fiscais` (migração `0004`). Quando a CBS substituir PIS/Cofins,
    feche a vigência de `pis_cumulativo`/`cofins_cumulativo` e cadastre a nova regra.
  - `receitas_historicas`: faturamento e folha de meses anteriores ao urutau (tela "Faturamento anterior").
- **Preparado para estoque**: `empresas.tratamento_mercadorias` e `despesas.compra_id` já existem.

## Estrutura

```
src/
  app/                 telas (App Router)
    (publico)/         entrar, criar conta
    empresas/          escolher/criar empresa
    e/[empresaId]/     painel, vendas, despesas, lançar, mais, ajustes
  components/          UI compartilhada
  db/                  schema Drizzle, conexão, categorias e fontes padrão
  lib/
    calculos/          cálculos puros: painel, folha, dívidas, parâmetros, Simples, MEI e Presumido
    servidor/          autenticação, acesso, consultas e server actions
drizzle/               migrações SQL
scripts/               migrate, reset, seed
tests/                 Vitest
```

## Fases

1. ✅ Fundação: login, empresa, categorias, vendas, despesas e painel básico
2. ✅ Funcionários com custo real e dívidas com parcelas
3. ✅ Impostos: MEI, Simples Nacional (com Fator R) e Lucro Presumido
4. Relatórios, exportação, despesas recorrentes e alertas de vencimento
