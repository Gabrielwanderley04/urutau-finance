import Link from "next/link";
import { exigirAcesso } from "@/lib/servidor/acesso";

export const metadata = { title: "Lançar" };

export default async function Lancar({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirAcesso(empresaId, "lancar");
  const base = `/e/${empresaId}`;
  return (
    <div className="space-y-4 pt-4">
      <h1 className="font-titulo text-2xl font-bold">O que você quer lançar?</h1>
      <Link href={`${base}/vendas/nova`} className="cartao flex items-center gap-4 !p-5 active:scale-[.99]">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-destaque font-titulo text-2xl font-bold text-sobre-destaque">↗</span>
        <span>
          <span className="block font-titulo text-xl font-bold">Venda</span>
          <span className="text-sm text-suave">Dinheiro que entrou ou vai entrar</span>
        </span>
      </Link>
      <Link href={`${base}/despesas/nova`} className="cartao flex items-center gap-4 !p-5 active:scale-[.99]">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-borda font-titulo text-2xl font-bold">↘</span>
        <span>
          <span className="block font-titulo text-xl font-bold">Despesa</span>
          <span className="text-sm text-suave">Conta, compra, salário, imposto…</span>
        </span>
      </Link>
    </div>
  );
}
