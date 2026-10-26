import Link from "next/link";
import { obterDb } from "@/db";
import { NOME_MODULO, PERFIS } from "@/lib/perfis";
import { listarEmpresasAdmin } from "@/lib/servidor/admin";

export const metadata = { title: "Empresas" };

export default async function Admin() {
  const lista = await listarEmpresasAdmin(obterDb());
  const pendentes = lista.reduce((s, e) => s + e.aConferir, 0);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold">Empresas atendidas</h1>
          <p className="text-sm text-suave">
            {lista.length} {lista.length === 1 ? "empresa" : "empresas"}
            {pendentes > 0 ? ` · ${pendentes} vendas esperando conferência dos donos` : ""}
          </p>
        </div>
        <Link href="/admin/empresas/nova" className="btn-principal !min-h-11">+ Nova empresa</Link>
      </header>
      <ul className="space-y-3">
        {lista.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/empresas/${e.id}`} className="cartao block space-y-2 active:scale-[.99]">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-titulo text-lg font-bold">{e.nome}</span>
                  <span className="block text-sm text-suave">
                    {PERFIS[e.perfil].nome} · {[e.cidade, e.uf].filter(Boolean).join("/") || "sem cidade"}
                  </span>
                </span>
                {e.aConferir > 0 && (
                  <span className="shrink-0 rounded-full bg-aviso-fundo px-2 py-0.5 text-xs font-medium">{e.aConferir} a conferir</span>
                )}
              </div>
              <p className="truncate text-xs text-suave">Dono: {e.donos || "nenhum"} · {e.membros} {e.membros === 1 ? "pessoa" : "pessoas"}</p>
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {[...e.modulos].map((m) => (
                  <li key={m} className="rounded-full border border-borda px-2 py-0.5">{NOME_MODULO[m]}</li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
