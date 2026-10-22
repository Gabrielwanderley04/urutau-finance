"use client";

import { useActionState } from "react";
import { Campo } from "@/components/Campos";
import type { EstadoForm } from "@/lib/estado-form";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";

export function FormDescricaoDivida({
  acao,
  inicial,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial: { credor: string; tipo: string; observacao: string };
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  return (
    <form action={enviar} className="space-y-3">
      <Campo rotulo="Credor" nome="credor" erro={e.credor}>
        <input id="credor" name="credor" className="campo" defaultValue={inicial.credor} required />
      </Campo>
      <Campo rotulo="Tipo" nome="tipo" erro={e.tipo}>
        <select id="tipo" name="tipo" className="campo" defaultValue={inicial.tipo}>
          {Object.entries(NOME_TIPO_DIVIDA).map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Observação" nome="observacao" erro={e.observacao}>
        <input id="observacao" name="observacao" className="campo" defaultValue={inicial.observacao} />
      </Campo>
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
      <button className="btn-secundario w-full" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
