"use client";

import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

/** Botão que chama uma server action já ligada aos seus argumentos e mostra o erro, se houver. */
export function BotaoAcao({
  acao,
  children,
  className = "btn-secundario",
  confirmar,
}: {
  acao: () => Promise<{ erro?: string } | void>;
  children: React.ReactNode;
  className?: string;
  confirmar?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  return (
    <>
      <button
        type="button"
        disabled={pendente}
        className={className}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          setErro(undefined);
          iniciar(async () => {
            try {
              const r = await acao();
              if (r?.erro) setErro(r.erro);
            } catch (e) {
              unstable_rethrow(e); // deixa o redirect() do Next seguir
              setErro("Não foi possível concluir. Tente de novo.");
            }
          });
        }}
      >
        {pendente ? "…" : children}
      </button>
      {erro && <span role="alert" className="block text-xs text-negativo">{erro}</span>}
    </>
  );
}
