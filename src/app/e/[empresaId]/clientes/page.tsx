import Link from "next/link";
import { obterDb } from "@/db";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { listarClientes } from "@/lib/servidor/clientes";
import { formatarTelefone } from "@/lib/validacao";

export const metadata = { title: "Clientes" };

const ORIGEM: Record<string, string> = { whatsapp: "WhatsApp", site: "Site", balcao: "Balcão", indicacao: "Indicação" };

export default async function Clientes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { empresaId } = await params;
  const { q = "" } = await searchParams;
  const ctx = await exigirAcesso(empresaId, "ver_clientes");
  const lista = await listarClientes(obterDb(), empresaId, q);
  const base = `/e/${empresaId}`;
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl font-bold">Clientes</h1>
        {pode(ctx.papel, "lancar") && <Link href={`${base}/clientes/novo`} className="btn-principal !min-h-11">+ Novo</Link>}
      </header>
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">Buscar por nome ou telefone</label>
        <input id="q" name="q" defaultValue={q} placeholder="Nome ou telefone" className="campo flex-1" />
        <button className="btn-secundario">Buscar</button>
      </form>
      {lista.length === 0 ? (
        <p className="py-10 text-center text-suave">
          {q ? `Ninguém encontrado para "${q}".` : "Nenhum cliente ainda. Quem falar pelo WhatsApp entra aqui sozinho."}
        </p>
      ) : (
        <ul className="cartao divide-y divide-borda !p-0">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.nome}</span>
                  <span className="block text-xs text-suave">
                    {formatarTelefone(c.telefone) || "sem telefone"}
                    {c.compras > 0 ? ` · ${c.compras} ${c.compras === 1 ? "compra" : "compras"}` : ""}
                  </span>
                </span>
                {ORIGEM[c.origem] && <span className="shrink-0 rounded-full border border-borda px-2 py-0.5 text-xs">{ORIGEM[c.origem]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
