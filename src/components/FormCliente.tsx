"use client";

import { useActionState } from "react";
import { Campo, Erro } from "@/components/Campos";
import type { EstadoForm } from "@/lib/estado-form";

export interface ClienteInicial {
  nome: string;
  telefone: string;
  email: string;
  documento: string;
  observacao: string;
}

export function FormCliente({
  acao,
  inicial,
  somenteLeitura = false,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial: ClienteInicial;
  somenteLeitura?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = { ...inicial, ...estado.valores };
  return (
    <form action={enviar} className="space-y-5">
      <fieldset disabled={somenteLeitura || pendente} className="space-y-5">
        <Campo rotulo="Nome" nome="nome" erro={e.nome}>
          <input id="nome" name="nome" required autoFocus={!inicial.nome} defaultValue={v.nome} className="campo" autoComplete="off" />
        </Campo>
        <Campo rotulo="WhatsApp / telefone" nome="telefone" erro={e.telefone} dica="Com DDD. É por ele que o atendente reconhece o cliente.">
          <input id="telefone" name="telefone" type="tel" inputMode="tel" placeholder="(21) 99999-8888" defaultValue={v.telefone} className="campo" />
        </Campo>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo rotulo="E-mail (opcional)" nome="email" erro={e.email}>
            <input id="email" name="email" type="email" defaultValue={v.email} className="campo" />
          </Campo>
          <Campo rotulo="CPF ou CNPJ (opcional)" nome="documento" erro={e.documento}>
            <input id="documento" name="documento" inputMode="numeric" defaultValue={v.documento} className="campo" />
          </Campo>
        </div>
        <Campo rotulo="Observações (opcional)" nome="observacao" erro={e.observacao}>
          <textarea id="observacao" name="observacao" rows={3} defaultValue={v.observacao} className="campo" placeholder="Ex.: procura SUV até R$ 90 mil, tem carro para dar na troca" />
        </Campo>
        <Erro msg={e._} />
        {!somenteLeitura && <button className="btn-principal w-full">{pendente ? "Salvando…" : "Salvar cliente"}</button>}
      </fieldset>
    </form>
  );
}
