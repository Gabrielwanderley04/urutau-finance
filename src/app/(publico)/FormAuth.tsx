"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Campo, Erro } from "@/components/Campos";
import type { EstadoForm } from "@/lib/estado-form";
import { criarConta, entrar } from "./acoes";

export function FormAuth({ modo }: { modo: "entrar" | "criar" }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(modo === "entrar" ? entrar : criarConta, {});
  const e = estado.erros ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={acao} className="space-y-4">
      {modo === "criar" && (
        <Campo rotulo="Seu nome" nome="nome" erro={e.nome}>
          <input id="nome" name="nome" className="campo" autoComplete="name" defaultValue={v.nome} required />
        </Campo>
      )}
      <Campo rotulo="E-mail" nome="email" erro={e.email}>
        <input id="email" name="email" type="email" className="campo" autoComplete="email" defaultValue={v.email} required />
      </Campo>
      <Campo rotulo="Senha" nome="senha" erro={e.senha} dica={modo === "criar" ? "Pelo menos 8 caracteres" : undefined}>
        <input
          id="senha"
          name="senha"
          type="password"
          className="campo"
          autoComplete={modo === "criar" ? "new-password" : "current-password"}
          required
        />
      </Campo>
      <Erro msg={e._} />
      <button className="btn-principal w-full" disabled={pendente}>
        {pendente ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
      </button>
      <p className="text-center text-sm text-suave">
        {modo === "entrar" ? (
          <>Ainda não tem conta? <Link href="/criar-conta" className="font-medium text-texto underline">Criar conta</Link></>
        ) : (
          <>Já tem conta? <Link href="/entrar" className="font-medium text-texto underline">Entrar</Link></>
        )}
      </p>
    </form>
  );
}
