"use client";

import { useActionState } from "react";
import type { EstadoForm } from "@/lib/estado-form";
import { formatarReais } from "@/lib/dinheiro";
import { nomeDoMes } from "@/lib/datas";

export interface LinhaHistorico {
  mes: string;
  receitaLancada: number;
  folhaLancada: number;
  receitaInformada: string;
  folhaInformada: string;
}

export function FormHistorico({ acao, linhas }: { acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>; linhas: LinhaHistorico[] }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={enviar} className="space-y-3">
      {linhas.map((l) => (
        <fieldset key={l.mes} className="cartao">
          <legend className="sr-only">{nomeDoMes(l.mes)}</legend>
          <p className="mb-2 font-titulo font-bold first-letter:uppercase">{nomeDoMes(l.mes)}</p>
          <div className="grid grid-cols-2 gap-3">
            {(["receita", "folha"] as const).map((campo) => {
              const nome = `${campo}_${l.mes}`;
              const lancado = campo === "receita" ? l.receitaLancada : l.folhaLancada;
              return (
                <div key={campo}>
                  <label htmlFor={nome} className="rotulo">{campo === "receita" ? "Faturamento" : "Folha + pró-labore"}</label>
                  <input id={nome} name={nome} inputMode="decimal" className="campo numero" placeholder="—"
                    defaultValue={v[nome] ?? (campo === "receita" ? l.receitaInformada : l.folhaInformada)} />
                  <p className={`mt-1 text-xs ${e[nome] ? "text-negativo" : "text-suave"}`}>
                    {e[nome] ?? (lancado > 0 ? `No urutau: ${formatarReais(lancado)}` : "Nada lançado")}
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
      <button className="btn-principal sticky bottom-24 w-full shadow-lg" disabled={pendente}>{pendente ? "Salvando…" : "Salvar histórico"}</button>
    </form>
  );
}
