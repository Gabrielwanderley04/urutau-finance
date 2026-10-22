import { Logo } from "@/components/Logo";

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <Logo className="mb-2 text-3xl" />
      <p className="mb-8 text-suave">As contas da sua empresa, numa tela só.</p>
      {children}
    </main>
  );
}
