/** Explicação em linguagem simples, aberta ao tocar no "?". */
export function Ajuda({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary
        aria-label={`O que é ${titulo}?`}
        className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full border border-borda text-xs text-suave [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <div className="absolute inset-x-3 z-10 mt-2 rounded-xl border border-borda bg-superficie-2 p-3 text-sm leading-relaxed text-texto shadow-lg">
        {children}
      </div>
    </details>
  );
}
