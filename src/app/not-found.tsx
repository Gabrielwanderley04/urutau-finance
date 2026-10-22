import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto max-w-md px-5 py-16 text-center">
      <p className="numero text-5xl font-bold text-destaque-texto">404</p>
      <h1 className="mt-4 font-titulo text-xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-suave">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/empresas" className="btn-secundario mt-8">Voltar para minhas empresas</Link>
    </main>
  );
}
