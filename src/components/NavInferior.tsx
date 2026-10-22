"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavInferior({ base, verPainel, lancar }: { base: string; verPainel: boolean; lancar: boolean }) {
  const caminho = usePathname();
  const itens: { href: string; rotulo: string; icone: string; central?: boolean }[] = [
    ...(verPainel ? [{ href: `${base}/painel`, rotulo: "Painel", icone: "◧" }] : []),
    { href: `${base}/vendas`, rotulo: "Vendas", icone: "↗" },
    ...(lancar ? [{ href: `${base}/lancar`, rotulo: "Lançar", icone: "+", central: true }] : []),
    { href: `${base}/despesas`, rotulo: "Despesas", icone: "↘" },
    { href: `${base}/mais`, rotulo: "Mais", icone: "☰" },
  ];
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-2xl items-end justify-around px-2">
        {itens.map((i) => {
          const ativo = caminho.startsWith(i.href);
          if (i.central)
            return (
              <li key={i.href} className="-mt-5">
                <Link
                  href={i.href}
                  aria-label="Lançar venda ou despesa"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-destaque font-titulo text-3xl font-bold text-sobre-destaque shadow-lg active:scale-95"
                >
                  +
                </Link>
              </li>
            );
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={ativo ? "page" : undefined}
                className={`flex min-w-16 flex-col items-center gap-0.5 py-2.5 text-xs ${ativo ? "font-bold text-texto" : "text-suave"}`}
              >
                <span aria-hidden className={`text-lg leading-none ${ativo ? "text-destaque-texto" : ""}`}>{i.icone}</span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
