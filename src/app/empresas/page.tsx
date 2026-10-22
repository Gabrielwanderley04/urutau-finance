import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { obterDb } from "@/db";
import { empresaUsuarios, empresas } from "@/db/schema";
import { NOME_PAPEL } from "@/lib/permissoes";
import { telaInicial } from "@/lib/servidor/acesso";
import { exigirUsuario } from "@/lib/servidor/auth";
import { sair } from "../(publico)/acoes";

export const metadata = { title: "Minhas empresas" };

export default async function Empresas() {
  const usuario = await exigirUsuario();
  const lista = await obterDb()
    .select({ id: empresas.id, nome: empresas.nome, cidade: empresas.cidade, uf: empresas.uf, papel: empresaUsuarios.papel })
    .from(empresaUsuarios)
    .innerJoin(empresas, eq(empresas.id, empresaUsuarios.empresaId))
    .where(eq(empresaUsuarios.usuarioId, usuario.id))
    .orderBy(asc(empresas.nome));

  if (lista.length === 0) redirect("/empresas/nova");

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Logo className="text-xl" />
      <h1 className="mt-6 font-titulo text-2xl font-bold">Olá, {usuario.nome.split(" ")[0]}</h1>
      <p className="mb-5 text-suave">Escolha a empresa:</p>
      <ul className="space-y-3">
        {lista.map((e) => (
          <li key={e.id}>
            <Link href={telaInicial(e.id, e.papel)} className="cartao flex items-center justify-between gap-3 active:scale-[.99]">
              <span>
                <span className="block font-titulo text-lg font-bold">{e.nome}</span>
                <span className="text-sm text-suave">
                  {[e.cidade, e.uf].filter(Boolean).join("/") || "—"} · {NOME_PAPEL[e.papel]}
                </span>
              </span>
              <span aria-hidden className="text-2xl text-suave">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/empresas/nova" className="btn-secundario mt-5 w-full">+ Cadastrar outra empresa</Link>
      <form action={sair} className="mt-10 text-center">
        <button className="text-sm text-suave underline">Sair</button>
      </form>
    </main>
  );
}
