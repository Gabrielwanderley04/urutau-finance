# urutau gestão

Gestão financeira simples para pequenas empresas brasileiras de comércio e serviços.
Mostra ao dono, numa tela só, quanto a empresa faturou, gastou, lucrou, quanto deve e
quanto deve pagar de imposto no mês.

## Rodando localmente

**Jeito mais fácil (sem Docker):** instale o [Node.js 22](https://nodejs.org), crie um banco grátis em
[neon.tech](https://neon.tech) (botão *Connect* → copie a connection string) e, na pasta do projeto:

```bash
npm install
npm run iniciar     # pede a connection string, cria as tabelas e os dados de exemplo, e abre o site
```

Abra http://localhost:3000. Nas próximas vezes, `npm run iniciar` (ou `npm run dev`) já basta.

**Com Docker (Postgres local):**

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:reset          # zera o banco local, aplica migrações e cria a empresa de exemplo
npm run dev               # http://localhost:3000
```

Acessos de exemplo (senha `urutau123`):

| E-mail | Papel | O que vê |
|---|---|---|
| `dono@urutau.dev` | Dono | Tudo; tem também uma segunda empresa (MEI) |
| `colaborador@urutau.dev` | Colaborador | Lança vendas/despesas e vê só o que lançou |
| `contador@urutau.dev` | Contador | Painel e lançamentos, somente leitura |
| `admin@urutau.dev` | Equipe Urutau | Painel Urutau (`/admin`): todas as empresas, logins e módulos |

Empresas de exemplo do `dono@`: **Padaria e Café Urutau** (Simples, Anexos I e III, com funcionários e dívidas),
**Marina Doces** (MEI perto do limite anual), **Estúdio Urutau Design** (Simples Anexo V com Fator R, que passa
para o Anexo III depois de contratar) e **Urutau Manutenção Industrial** (Lucro Presumido, com adicional do IRPJ e encargos) e **Urutau Veículos**
(revenda de carros, o primeiro cliente piloto: clientes e três vendas do WhatsApp esperando conferência).

## Publicar (Vercel + Neon)

1. **Banco**: crie um projeto em [neon.tech](https://neon.tech) e copie a *connection string*.
2. **Site**: em [vercel.com](https://vercel.com), *Add New → Project* e importe este repositório.
   Em *Environment Variables*, crie `DATABASE_URL` com a connection string do Neon
   (se usar a integração Neon da Vercel, `DATABASE_URL` e `DATABASE_URL_UNPOOLED` são criadas sozinhas).
3. *Deploy*. O build (`vercel-build`) aplica as migrações antes de compilar.
4. **Contas**: crie a sua em `/criar-conta`. Para ter as empresas de exemplo no banco publicado, rode uma vez
   no seu computador, **com uma senha nova** (as de exemplo ficariam públicas):

   ```bash
   DATABASE_URL="<connection string do Neon>" SEED_SENHA="uma-senha-forte" npm run db:seed
   ```

`npm run db:reset` recusa apagar um banco que não seja local.

5. **Equipe Urutau**: crie a conta em `/criar-conta` e rode `DATABASE_URL="<connection string>" npm run admin -- seu@email`.
   Quem é equipe vê o painel `/admin` e entra em qualquer empresa com os poderes do dono (com um aviso no topo).
6. **Rotina diária**: crie a variável `CRON_SECRET` (valor longo e aleatório). A Vercel chama `/api/cron` todo dia às 6h
   (horário de Brasília; `vercel.json`).

**No celular**: abra o link e use *Compartilhar → Adicionar à Tela de Início* (iPhone/Safari) ou
*⋮ → Instalar app* (Android/Chrome). O urutau abre em tela cheia, com ícone próprio.

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
- **Gerado automaticamente** (`src/lib/servidor/automaticos.ts`, chamado pelas telas antes de mostrar os números; idempotente):
  - folha do mês; despesas recorrentes até o mês seguinte; guias de impostos dos meses fechados.
  - Cada lançamento gerado tem uma `referencia` única (`recorrente:<id>:2026-10`, `imposto:das:2026-09`): nunca duplica,
    nem volta depois que o dono exclui. Guias não são geradas se o dono já lançou a guia daquele mês à mão.
  - Vencimentos: DAS dia 20 (fim de semana → próximo dia útil), PIS/Cofins dia 25 (→ dia útil anterior),
    ISS/ICMS dia 10 (referência), IRPJ/CSLL no último dia útil do mês seguinte ao trimestre. Feriados não são considerados.
- **13º e férias**: a reserva mensal já pesa no lucro; o pagamento (`pagamentos_provisao`) entra só no caixa.
- **Relatórios** (`/e/<id>/relatorios`): PDF e CSVs (resumo, vendas, despesas, funcionários, dívidas, impostos) ou tudo num .zip.
  CSV com `;`, vírgula decimal e BOM UTF-8, para abrir direto no Excel; fórmulas são neutralizadas (CSV injection).
- **Preparado para estoque**: `empresas.tratamento_mercadorias` e `despesas.compra_id` já existem.
- **Ecossistema (Fase 5)**:
  - *Perfil* da empresa (`src/lib/perfis.ts`): revenda de veículos, consultório, varejo, serviço com visita, alimentação ou só finanças.
    Decide as fontes de receita iniciais, os nomes do menu e os módulos ligados. `empresa_modulos` guarda só o que o painel Urutau
    mudou em relação ao perfil.
  - *Clientes* identificados pelo telefone com DDI, só dígitos (`5521999998888`), o formato do WhatsApp. Um telefone por empresa
    (índice único parcial, ignorando excluídos). `acharOuCriarPorTelefone` é a porta de entrada do atendente.
  - *Conferência*: `vendas.conferido_em` tem padrão `now()`; lançamento à mão já nasce conferido. Canais automáticos
    (WhatsApp, agenda, site) gravam `null` e a venda aparece em "Para conferir" até o dono dar o check. `vendas.origem` diz de onde veio.
  - *Equipe Urutau* (`usuarios.superadmin`): `exigirAcesso` deixa entrar em qualquer empresa como dono (`ctx.comoAdmin`).
    Ações do painel ficam em `auditoria`; senhas provisórias aparecem uma vez na tela e nunca são gravadas.
  - *Tarefas* (`src/lib/servidor/tarefas.ts`): fila no próprio Postgres (`FOR UPDATE SKIP LOCKED`), chave para não duplicar,
    nova tentativa com espera crescente (1, 4, 9, 16 min) e desistência após 5. Hoje roda a rotina diária de cada empresa;
    é onde entram as mensagens do WhatsApp e os lembretes.
  - Consultas novas recebem `db` e `empresaId` explícitos (não a sessão), para o atendente usá-las sem usuário logado.

## Estrutura

```
src/
  app/                 telas (App Router)
    (publico)/         entrar, criar conta
    empresas/          escolher/criar empresa
    e/[empresaId]/     painel, vendas, despesas (e recorrentes), contas, funcionários, dívidas, impostos, relatórios, ajustes
  components/          UI compartilhada
  db/                  schema Drizzle, conexão, categorias e fontes padrão
  lib/
    calculos/          cálculos puros: painel, folha, dívidas, parâmetros, Simples, MEI, Presumido, guias, recorrentes, 13º/férias
    relatorios/        CSV e PDF
    servidor/          autenticação, acesso, consultas e server actions
drizzle/               migrações SQL
scripts/               migrate, reset, seed
tests/                 Vitest
```

## Fases

1. ✅ Fundação: login, empresa, categorias, vendas, despesas e painel básico
2. ✅ Funcionários com custo real e dívidas com parcelas
3. ✅ Impostos: MEI, Simples Nacional (com Fator R) e Lucro Presumido
4. ✅ Relatórios (PDF/CSV/ZIP), despesas recorrentes, guias de impostos como contas a pagar, agenda de vencimentos e 13º/férias
5. ✅ Base do ecossistema: painel Urutau, perfis e módulos (revenda de veículos primeiro), clientes, caixa de conferência,
   auditoria, fila de tarefas e rotina diária
6. Estoque de veículos e agenda de visitas/test drive (revenda); depois atendente no WhatsApp
