"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { Opcoes } from "@/components/Opcoes";
import type { EstadoForm } from "@/lib/estado-form";

export interface RecorrenteInicial {
  descricao: string;
  valor: string;
  categoriaId: string;
  diaVencimento: string;
  inicio: string;
  fim: string;
}

export function FormRecorrente({
  acao,
  categorias,
  inicial,
  textoBotao,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  categorias: { id: string; nome: string }[];
  inicial: RecorrenteInicial;
  textoBotao: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = { ...inicial, ...estado.valores };
  const [categoria, setCategoria] = useState(v.categoriaId);
  return (
    <form action={enviar} className="space-y-5">
      <Campo rotulo="O que é?" nome="descricao" erro={e.descricao}>
        <input id="descricao" name="descricao" className="campo" required defaultValue={v.descricao} placeholder="Ex.: aluguel, internet, contador" />
      </Campo>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Campo rotulo="Valor por mês (R$)" nome="valor" erro={e.valor}>
          <input id="valor" name="valor" inputMode="decimal" required className="campo numero !text-xl font-bold" defaultValue={v.valor} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Todo dia" nome="diaVencimento" erro={e.diaVencimento}>
          <input id="diaVencimento" name="diaVencimento" inputMode="numeric" required className="campo" defaultValue={v.diaVencimento} placeholder="10" />
        </Campo>
      </div>
      <div>
        <span className="rotulo">Categoria</span>
        <Opcoes nome="categoriaId" opcoes={categorias.map((c) => ({ v: c.id, nome: c.nome }))} valor={categoria} aoMudar={setCategoria} colunas={2} />
        <Erro msg={e.categoriaId} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="A partir de" nome="inicio" erro={e.inicio}>
          <input id="inicio" name="inicio" type="month" required className="campo" defaultValue={v.inicio} />
        </Campo>
        <Campo rotulo="Até (opcional)" nome="fim" erro={e.fim} dica="Vazio = sem data para acabar">
          <input id="fim" name="fim" type="month" className="campo" defaultValue={v.fim} />
        </Campo>
      </div>
      <p className="text-xs text-suave">
        O urutau cria a conta a pagar de cada mês sozinho, até o mês que vem. Se o valor de um mês vier diferente (ex.: conta de luz), edite só o lançamento daquele mês.
      </p>
      <Erro msg={e._} />
      <button className="btn-principal w-full" disabled={pendente}>{pendente ? "Salvando…" : textoBotao}</button>
    </form>
  );
}
