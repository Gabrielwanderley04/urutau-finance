"use client";

/** Grupo de botões de escolha única, grandes para o dedo. */
export function Opcoes({
  nome,
  opcoes,
  valor,
  aoMudar,
  colunas = 3,
}: {
  nome: string;
  opcoes: { v: string; nome: string }[];
  valor: string;
  aoMudar: (v: string) => void;
  colunas?: 2 | 3 | 4;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[colunas];
  return (
    <div className={`grid gap-2 ${grid}`}>
      {opcoes.map((o) => (
        <label
          key={o.v}
          className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm ${
            valor === o.v ? "border-2 border-destaque bg-superficie-2 font-bold" : "border-borda bg-superficie"
          }`}
        >
          <input type="radio" name={nome} value={o.v} checked={valor === o.v} onChange={() => aoMudar(o.v)} className="sr-only" />
          {valor === o.v && <span aria-hidden className="mr-1.5 text-destaque-texto">✓</span>}
          {o.nome}
        </label>
      ))}
    </div>
  );
}
