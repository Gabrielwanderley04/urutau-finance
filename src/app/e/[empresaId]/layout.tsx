import Link from "next/link";
import { NavInferior } from "@/components/NavInferior";
import { NOME_PAPEL, pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";

export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { empresa, papel } = await exigirAcesso(empresaId);
  const base = `/e/${empresaId}`;
  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-10 border-b border-borda bg-fundo/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/empresas" className="min-w-0">
            <span className="block truncate font-titulo font-bold">{empresa.nome}</span>
            <span className="block text-xs text-suave">{NOME_PAPEL[papel]} · trocar empresa</span>
          </Link>
          <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-destaque" />
        </div>
      </header>
      {papel === "contador" && (
        <p className="border-b border-borda bg-superficie px-4 py-2 text-center text-sm text-suave">Acesso de contador: somente leitura.</p>
      )}
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <NavInferior base={base} verPainel={pode(papel, "ver_painel")} lancar={pode(papel, "lancar")} />
    </div>
  );
}
