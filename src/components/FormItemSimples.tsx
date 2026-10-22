"use client";

import { useActionState } from "react";
import { Erro } from "@/components/Campos";
import type { EstadoForm } from "@/lib/estado-form";

/** Formulário de uma linha (nome + seletor) para categorias e fontes. */
export function FormItemSimples({
  acao,
  nome,
  campoSelect,
  opcoes,
  valorSelect,
  textoBotao,
  placeholder,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  nome?: string;
  campoSelect: string;
  opcoes: { v: string; nome: string }[];
  valorSelect?: string;
  textoBotao: string;
  placeholder?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input name="nome" defaultValue={nome} placeholder={placeholder} aria-label="Nome" className="campo min-w-0 flex-[2_1_10rem]" required />
        <select name={campoSelect} defaultValue={valorSelect ?? opcoes[0].v} aria-label="Tipo" className="campo flex-[1_1_7rem]">
          {opcoes.map((o) => <option key={o.v} value={o.v}>{o.nome}</option>)}
        </select>
        <button className="btn-secundario flex-none" disabled={pendente}>{pendente ? "…" : textoBotao}</button>
      </div>
      <Erro msg={estado.erros?.nome ?? estado.erros?.[campoSelect]} />
      {estado.ok && <p role="status" className="text-xs text-positivo">✓ {estado.ok}</p>}
    </form>
  );
}
