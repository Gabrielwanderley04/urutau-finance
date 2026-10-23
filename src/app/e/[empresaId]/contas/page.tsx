import Link from "next/link";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { formatarDataCurta, hoje, mesAtual } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { pagarParcela } from "@/lib/servidor/acoes-dividas";
import { pagarFolha } from "@/lib/servidor/acoes-funcionarios";
import { marcarDespesaPaga, marcarVendaRecebida } from "@/lib/servidor/acoes-lancamentos";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { type Conta, type Grupo, grupoDe, listarContas } from "@/lib/servidor/contas";

export const metadata = { title: "Contas a pagar e receber" };

const GRUPOS: { g: Grupo; titulo: string }[] = [
  { g: "atrasadas", titulo: "Atrasadas" },
  { g: "hoje", titulo: "Vencem hoje" },
  { g: "semana", titulo: "Próximos 7 dias" },
  { g: "mes", titulo: "Até 30 dias" },
];

const FILTROS = [
  { v: "pagar", nome: "A pagar" },
  { v: "receber", nome: "A receber" },
  { v: "tudo", nome: "Tudo" },
] as const;

export default async function Contas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  const { empresaId } = await params;
  const { ver: verParam } = await searchParams;
  const ver = FILTROS.find((f) => f.v === verParam)?.v ?? "pagar";
  const { empresa, papel } = await exigirAcesso(empresaId, "ver_painel");
  const db = obterDb();
  const hojeData = hoje();
  await prepararEmpresa(db, empresa, mesAtual());
  const contas = await listarContas(db, empresaId, hojeData);
  const base = `/e/${empresaId}`;
  const gerencia = pode(papel, "gerenciar");
  const total = (lista: Conta[], sentido: Conta["sentido"]) => lista.filter((c) => c.sentido === sentido).reduce((s, c) => s + c.valor, 0);

  const acao = (c: Conta) => {
    if (!gerencia) return null;
    const a =
      c.tipo === "despesa" ? marcarDespesaPaga.bind(null, empresaId, c.id)
      : c.tipo === "folha" ? pagarFolha.bind(null, empresaId, c.id, undefined)
      : c.tipo === "parcela" ? pagarParcela.bind(null, empresaId, c.id)
      : marcarVendaRecebida.bind(null, empresaId, c.id);
    return <BotaoAcao acao={a} className="text-xs text-suave underline">{c.sentido === "pagar" ? "paguei" : "recebi"}</BotaoAcao>;
  };

  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl font-bold">Contas</h1>
      <section className="cartao grid grid-cols-2 gap-3">
        <div>
          <p className="text-sm text-suave">A pagar em 30 dias</p>
          <Valor centavos={total(contas, "pagar")} tamanho="md" />
        </div>
        <div>
          <p className="text-sm text-suave">A receber em 30 dias</p>
          <Valor centavos={total(contas, "receber")} tamanho="md" />
        </div>
        <p className="col-span-2 text-xs text-suave">Inclui despesas, guias de impostos, folha, parcelas de dívidas e vendas a prazo.</p>
      </section>

      <nav aria-label="Filtrar contas" className="grid grid-cols-3 gap-2">
        {FILTROS.map((f) => (
          <Link key={f.v} href={`${base}/contas?ver=${f.v}`} aria-current={ver === f.v ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl border text-sm ${ver === f.v ? "border-2 border-destaque bg-superficie-2 font-bold" : "border-borda bg-superficie"}`}>
            {f.nome}
          </Link>
        ))}
      </nav>

      {GRUPOS.map(({ g, titulo }) => {
        const lista = contas.filter((c) => grupoDe(c.data, hojeData) === g && (ver === "tudo" || c.sentido === ver));
        if (!lista.length) return null;
        const atrasada = g === "atrasadas";
        return (
          <section key={g} className={`cartao !p-0 ${atrasada ? "border-negativo" : ""}`}>
            <h2 className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-borda px-4 py-2.5 font-titulo font-bold ${atrasada ? "text-negativo" : ""}`}>
              <span>{atrasada && "▼ "}{titulo}</span>
              <span className="text-xs font-normal text-suave">
                pagar {formatarReais(total(lista, "pagar"))} · receber {formatarReais(total(lista, "receber"))}
              </span>
            </h2>
            <ul className="divide-y divide-borda">
              {lista.map((c) => (
                <li key={`${c.tipo}-${c.id}`} className="flex items-center gap-3 px-4 py-2.5">
                  <Link href={`${base}/${c.link}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.descricao}</span>
                    <span className={`block text-xs ${atrasada ? "text-negativo" : "text-suave"}`}>
                      {c.sentido === "pagar" ? "Pagar" : "Receber"} {formatarDataCurta(c.data)} · {c.detalhe}
                    </span>
                  </Link>
                  <div className="flex flex-col items-end gap-1">
                    <Valor centavos={c.sentido === "pagar" ? -c.valor : c.valor} tamanho="sm" sinalPositivo />
                    {acao(c)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!contas.some((c) => ver === "tudo" || c.sentido === ver) && <p className="py-8 text-center text-suave">Nada em aberto nos próximos 30 dias. 🎉</p>}
      <p className="text-xs text-suave">Os vencimentos não consideram feriados. Guias de impostos são estimativas: ajuste o valor quando a guia chegar.</p>
    </div>
  );
}
