import Link from "next/link";
import { Logo } from "@/components/Logo";
import { exigirSuperadmin } from "@/lib/servidor/acesso";

export const metadata = { title: { template: "%s · Painel Urutau", default: "Painel Urutau" } };

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSuperadmin();
  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-10 border-b border-borda bg-fundo/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo className="text-lg" />
            <span className="rounded-full border border-destaque px-2 py-0.5 text-xs font-bold">equipe</span>
          </Link>
          <span className="truncate text-xs text-suave">{usuario.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}
