"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { Opcoes } from "@/components/Opcoes";
import type { EstadoForm } from "@/lib/estado-form";

export interface DespesaInicial {
  data: string;
  valor: string;
  descricao: string;
  categoriaId: string;
  status: string;
  vencimento: string;
  pagoEm: string;
}

export function FormDespesa({
  acao,
  categorias,
  inicial,
  somenteLeitura = false,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  categorias: { id: string; nome: string; entraNoLucro: boolean }[];
  inicial: DespesaInicial;
  somenteLeitura?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = { ...inicial, ...estado.valores };
  const [categoria, setCategoria] = useState(v.categoriaId);
  const [status, setStatus] = useState(v.status);
  const cat = categorias.find((c) => c.id === categoria);

  return (
    <form action={enviar} className="space-y-5">
      <fieldset disabled={somenteLeitura || pendente} className="space-y-5">
        <Campo rotulo="Valor (R$)" nome="valor" erro={e.valor}>
          <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00" required autoFocus={!inicial.valor}
            defaultValue={v.valor} className="campo numero !py-4 !text-3xl font-bold" />
        </Campo>

        <Campo rotulo="Com o quê?" nome="descricao" erro={e.descricao}>
          <input id="descricao" name="descricao" defaultValue={v.descricao} placeholder="Ex.: aluguel, conta de luz, fornecedor" className="campo" />
        </Campo>

        <div>
          <span className="rotulo">Categoria</span>
          <Opcoes nome="categoriaId" opcoes={categorias.map((c) => ({ v: c.id, nome: c.nome }))} valor={categoria} aoMudar={setCategoria} colunas={2} />
          {cat && !cat.entraNoLucro && (
            <p className="mt-2 text-xs text-suave">
              Esta categoria conta só no caixa. O lucro já desconta o imposto estimado, então ele não é descontado duas vezes.
            </p>
          )}
          <Erro msg={e.categoriaId} />
        </div>

        <div>
          <span className="rotulo">Já pagou?</span>
          <Opcoes nome="status" opcoes={[{ v: "pago", nome: "Sim, pago" }, { v: "a_pagar", nome: "Não, a pagar" }]} valor={status} aoMudar={setStatus} colunas={2} />
          <Erro msg={e.status} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data da despesa" nome="data" erro={e.data} dica="Mês em que pesa no lucro">
            <input id="data" name="data" type="date" required defaultValue={v.data} className="campo" />
          </Campo>
          <Campo rotulo="Vencimento" nome="vencimento" erro={e.vencimento}>
            <input id="vencimento" name="vencimento" type="date" defaultValue={v.vencimento} className="campo" />
          </Campo>
        </div>
        {status === "pago" && (
          <Campo rotulo="Paguei em" nome="pagoEm" erro={e.pagoEm} dica="Se deixar em branco, usamos o vencimento">
            <input id="pagoEm" name="pagoEm" type="date" defaultValue={v.pagoEm} className="campo" />
          </Campo>
        )}

        <Erro msg={e._} />
        {!somenteLeitura && <button className="btn-principal w-full">{pendente ? "Salvando…" : "Salvar despesa"}</button>}
      </fieldset>
    </form>
  );
}
