"use client";

import { useActionState, useState, useTransition } from "react";
import { Campo } from "@/components/Campos";
import type { EstadoForm } from "@/lib/estado-form";

const PAPEIS = [
  { v: "dono", nome: "Dono", desc: "acesso total" },
  { v: "colaborador", nome: "Colaborador", desc: "lança vendas e despesas" },
  { v: "contador", nome: "Contador", desc: "somente leitura" },
] as const;

type Papel = (typeof PAPEIS)[number]["v"];

export function SeletorPapel({
  papel,
  mudar,
}: {
  papel: Papel;
  mudar: (p: Papel) => Promise<{ erro?: string } | void>;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const [valor, setValor] = useState(papel);
  return (
    <div>
      <select
        aria-label="Papel"
        className="campo !min-h-10 !py-2 text-sm"
        value={valor}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.value as Papel;
          const anterior = valor;
          setValor(novo);
          setErro(undefined);
          iniciar(async () => {
            const r = await mudar(novo);
            if (r?.erro) {
              setErro(r.erro);
              setValor(anterior);
            }
          });
        }}
      >
        {PAPEIS.map((p) => <option key={p.v} value={p.v}>{p.nome}</option>)}
      </select>
      {erro && <p role="alert" className="mt-1 text-xs text-negativo">{erro}</p>}
    </div>
  );
}

export function FormNovoMembro({ acao }: { acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="space-y-3">
      <Campo rotulo="E-mail da pessoa" nome="email" erro={estado.erros?.email} dica="A pessoa precisa já ter criado uma conta no urutau.">
        <input id="email" name="email" type="email" className="campo" defaultValue={estado.valores?.email} required />
      </Campo>
      <fieldset>
        <legend className="rotulo">Papel</legend>
        {PAPEIS.map((p) => (
          <label key={p.v} className="flex items-center gap-2 py-1.5">
            <input type="radio" name="papel" value={p.v} defaultChecked={p.v === "colaborador"} className="h-5 w-5 accent-[var(--destaque)]" />
            <span><strong>{p.nome}</strong> <span className="text-sm text-suave">· {p.desc}</span></span>
          </label>
        ))}
      </fieldset>
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
      <button className="btn-principal w-full" disabled={pendente}>{pendente ? "Adicionando…" : "Adicionar"}</button>
    </form>
  );
}
