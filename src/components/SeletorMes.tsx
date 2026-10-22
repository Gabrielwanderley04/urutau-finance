import Link from "next/link";
import { type Mes, nomeDoMes, somarMeses } from "@/lib/datas";

export function SeletorMes({ mes, base, mesAtual }: { mes: Mes; base: string; mesAtual: Mes }) {
  const link = (m: Mes) => `${base}?mes=${m}`;
  return (
    <nav aria-label="Escolher mês" className="flex items-center justify-between gap-2">
      <Link href={link(somarMeses(mes, -1))} className="btn-secundario !min-h-11 !px-4" aria-label="Mês anterior">
        ‹
      </Link>
      <div className="text-center">
        <p className="font-titulo text-lg font-bold first-letter:uppercase">{nomeDoMes(mes)}</p>
        {mes !== mesAtual && (
          <Link href={link(mesAtual)} className="text-xs text-suave underline">
            voltar para o mês atual
          </Link>
        )}
      </div>
      <Link href={link(somarMeses(mes, 1))} className="btn-secundario !min-h-11 !px-4" aria-label="Próximo mês">
        ›
      </Link>
    </nav>
  );
}
