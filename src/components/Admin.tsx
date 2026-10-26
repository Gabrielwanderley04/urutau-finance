"use client";

import { useActionState, useState, useTransition } from "react";
import { Campo, Erro } from "@/components/Campos";
import type { Modulo } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { NOME_MODULO, TODOS_MODULOS } from "@/lib/perfis";

type Acao = (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;

function Retorno({ estado }: { estado: EstadoForm }) {
  return (
    <>
      <Erro msg={estado.erros?._} />
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
    </>
  );
}

export function FormModulos({ acao, ligados }: { acao: Acao; ligados: Modulo[] }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="space-y-3">
      <ul className="space-y-2">
        {TODOS_MODULOS.map((m) => (
          <li key={m}>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name={`modulo_${m}`}
                defaultChecked={ligados.includes(m)}
                disabled={m === "financas"}
                className="h-5 w-5 accent-[var(--destaque)]"
              />
              <span>{NOME_MODULO[m]}</span>
              {m === "financas" && <span className="text-xs text-suave">sempre ligado</span>}
            </label>
          </li>
        ))}
      </ul>
      <Retorno estado={estado} />
      <button className="btn-secundario w-full" disabled={pendente}>{pendente ? "Salvando…" : "Salvar módulos"}</button>
    </form>
  );
}

export function FormPessoaAdmin({ acao }: { acao: Acao }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" nome="pessoaNome" erro={e.pessoaNome}>
          <input id="pessoaNome" name="pessoaNome" required defaultValue={v.pessoaNome} className="campo" />
        </Campo>
        <Campo rotulo="E-mail" nome="pessoaEmail" erro={e.pessoaEmail}>
          <input id="pessoaEmail" name="pessoaEmail" type="email" required defaultValue={v.pessoaEmail} className="campo" />
        </Campo>
      </div>
      <Campo rotulo="Papel" nome="papel" erro={e.papel}>
        <select id="papel" name="papel" defaultValue={v.papel ?? "colaborador"} className="campo">
          <option value="dono">Dono: vê e gerencia tudo</option>
          <option value="colaborador">Colaborador: lança e atende</option>
          <option value="contador">Contador: só leitura</option>
        </select>
      </Campo>
      <Retorno estado={estado} />
      <button className="btn-secundario w-full" disabled={pendente}>{pendente ? "Adicionando…" : "Adicionar pessoa"}</button>
    </form>
  );
}

/** A senha nova aparece só aqui, uma vez. */
export function BotaoRedefinirSenha({ acao, nome }: { acao: () => Promise<{ erro?: string; senha?: string }>; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [r, setR] = useState<{ erro?: string; senha?: string }>({});
  if (r.senha)
    return (
      <p role="status" className="rounded-lg bg-aviso-fundo p-2 text-sm">
        Senha provisória de {nome.split(" ")[0]}: <strong className="font-mono select-all">{r.senha}</strong>. Anote agora; ela não aparece de novo.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {confirmando ? (
        <>
          <span>Gerar senha nova e desconectar {nome.split(" ")[0]}?</span>
          <button type="button" className="underline" disabled={pendente} onClick={() => iniciar(async () => setR(await acao()))}>
            {pendente ? "…" : "Sim, gerar"}
          </button>
          <button type="button" className="text-suave underline" onClick={() => setConfirmando(false)}>Cancelar</button>
        </>
      ) : (
        <button type="button" className="text-suave underline" onClick={() => setConfirmando(true)}>Redefinir senha</button>
      )}
      {r.erro && <span role="alert" className="text-negativo">{r.erro}</span>}
    </div>
  );
}
