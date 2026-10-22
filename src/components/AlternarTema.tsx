"use client";

import { useEffect, useState } from "react";

type Tema = "claro" | "escuro";

export function AlternarTema() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    const atual = document.documentElement.dataset.theme as Tema | undefined;
    setTema(atual ?? (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro"));
  }, []);

  function alternar() {
    const novo: Tema = tema === "claro" ? "escuro" : "claro";
    document.documentElement.dataset.theme = novo;
    document.cookie = `tema=${novo}; path=/; max-age=31536000; samesite=lax`;
    setTema(novo);
  }

  return (
    <button type="button" onClick={alternar} className="btn-secundario w-full justify-between">
      <span>Tema</span>
      <span className="text-suave">{tema === "claro" ? "☀ Claro" : "☾ Escuro"}</span>
    </button>
  );
}
