import Link from "next/link";
import { NavInferior } from "@/components/NavInferior";
import { NOME_PAPEL, pode } from "@/lib/permissoes";
import { obterDb } from "@/db";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { contarParaConferir } from "@/lib/servidor/conferencia";

export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { empresa, papel, comoAdmin } = await exigirAcesso(empresaId);
  const base = `/e/${empresaId}`;
  const aConferir = pode(papel, "conferir") ? await contarParaConferir(obterDb(), empresaId) : 0;
  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-10 border-b border-borda bg-fundo/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/empresas" className="min-w-0">
            <span className="block truncate font-titulo font-bold">{empresa.nome}</span>
            <span className="block text-xs text-suave">{comoAdmin ? "Equipe Urutau" : NOME_PAPEL[papel]} · trocar empresa</span>
          </Link>
          <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-destaque" />
        </div>
      </header>
      {comoAdmin && (
        <p className="border-b border-borda bg-aviso-fundo px-4 py-2 text-center text-sm">
          Você está vendo esta empresa como equipe Urutau. <Link href="/admin" className="underline">Voltar ao painel Urutau</Link>
        </p>
      )}
      {aConferir > 0 && (
        <Link href={`${base}/conferir`} className="block border-b border-borda bg-aviso-fundo px-4 py-2 text-center text-sm font-medium">
          {aConferir === 1 ? "1 venda entrou sozinha e espera" : `${aConferir} vendas entraram sozinhas e esperam`} o seu check ›
        </Link>
      )}
      {papel === "contador" && (
        <p className="border-b border-borda bg-superficie px-4 py-2 text-center text-sm text-suave">Acesso de contador: somente leitura.</p>
      )}
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <NavInferior base={base} verPainel={pode(papel, "ver_painel")} lancar={pode(papel, "lancar")} />
    </div>
  );
}
