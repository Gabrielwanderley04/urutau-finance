"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatarReais } from "@/lib/dinheiro";
import { nomeDoMes } from "@/lib/datas";

export interface PontoMes {
  mes: string;
  faturamento: number;
  despesas: number;
  lucro: number;
}

const SERIES = [
  { chave: "faturamento", nome: "Faturamento", cor: "var(--serie-faturamento)" },
  { chave: "despesas", nome: "Despesas", cor: "var(--serie-despesas)" },
  { chave: "lucro", nome: "Lucro", cor: "var(--serie-lucro)" },
] as const;

function compacto(centavos: number) {
  const reais = centavos / 100; // só para rótulo do eixo
  const abs = Math.abs(reais);
  const s = reais < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${s}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${s}${Math.round(abs / 1_000)} mil`;
  return `${s}${Math.round(abs)}`;
}

function Dica({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-xl border border-borda bg-superficie-2 p-3 text-sm shadow-lg">
      <p className="mb-1.5 font-bold first-letter:uppercase">{nomeDoMes(label)}</p>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.chave)?.value ?? 0;
        return (
          <p key={s.chave} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-suave">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
              {s.nome}
            </span>
            <span className={`numero ${v < 0 ? "text-negativo" : ""}`}>{formatarReais(v)}</span>
          </p>
        );
      })}
    </div>
  );
}

export function GraficoMeses({ dados }: { dados: PontoMes[] }) {
  const [tabela, setTabela] = useState(false);
  const temDados = dados.some((d) => d.faturamento || d.despesas);

  return (
    <section className="cartao">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-titulo text-lg font-bold">Últimos 12 meses</h2>
        <button type="button" onClick={() => setTabela((t) => !t)} className="text-sm text-suave underline">
          {tabela ? "ver gráfico" : "ver tabela"}
        </button>
      </div>

      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-suave" aria-label="Legenda">
        {SERIES.map((s) => (
          <li key={s.chave} className="flex items-center gap-1.5">
            <span
              className={s.chave === "lucro" ? "inline-block h-0.5 w-4" : "inline-block h-2.5 w-2.5 rounded-sm"}
              style={{ background: s.cor }}
            />
            {s.nome}
          </li>
        ))}
      </ul>

      {!temDados ? (
        <p className="py-10 text-center text-suave">Ainda não há lançamentos nestes meses.</p>
      ) : tabela ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-suave">
              <tr>
                <th className="py-1.5 font-medium">Mês</th>
                {SERIES.map((s) => (
                  <th key={s.chave} className="py-1.5 text-right font-medium">{s.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.mes} className="border-t border-borda">
                  <td className="py-1.5">{nomeDoMes(d.mes, true)}</td>
                  {SERIES.map((s) => (
                    <td key={s.chave} className={`numero py-1.5 text-right ${d[s.chave] < 0 ? "text-negativo" : ""}`}>
                      {formatarReais(d[s.chave])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full" role="img" aria-label="Gráfico de faturamento, despesas e lucro dos últimos 12 meses">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dados} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--borda)" strokeOpacity={0.5} />
              <XAxis
                dataKey="mes"
                tickFormatter={(m: string) => nomeDoMes(m, true).slice(0, 3)}
                tick={{ fill: "var(--texto-suave)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={compacto}
                tick={{ fill: "var(--texto-suave)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <ReferenceLine y={0} stroke="var(--texto-suave)" />
              <Tooltip content={<Dica />} cursor={{ fill: "var(--superficie-2)", opacity: 0.6 }} />
              <Bar dataKey="faturamento" fill="var(--serie-faturamento)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="despesas" fill="var(--serie-despesas)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                dataKey="lucro"
                stroke="var(--serie-lucro)"
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--superficie)", fill: "var(--serie-lucro)" }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
