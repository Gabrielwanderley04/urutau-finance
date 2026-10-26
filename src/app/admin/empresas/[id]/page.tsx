import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoRedefinirSenha, FormModulos, FormPessoaAdmin } from "@/components/Admin";
import { Cabecalho } from "@/components/Campos";
import { obterDb } from "@/db";
import { PERFIS } from "@/lib/perfis";
import { NOME_PAPEL } from "@/lib/permissoes";
import { adicionarPessoaAdmin, redefinirSenhaAdmin, salvarModulos } from "@/lib/servidor/acoes-admin";
import { obterEmpresaAdmin } from "@/lib/servidor/admin";

export const metadata = { title: "Empresa" };

const ATOR = { usuario: "", admin: "equipe Urutau", agente: "atendente", sistema: "sistema" } as const;

export default async function EmpresaAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterEmpresaAdmin(obterDb(), id) : null;
  if (!dados) notFound();
  const { empresa, membros, modulos, eventos } = dados;
  return (
    <div className="space-y-6">
      <Cabecalho titulo={empresa.nome} voltar="/admin" />
      <section className="cartao space-y-3">
        <p className="text-sm text-suave">
          {PERFIS[empresa.perfil].nome} · {[empresa.cidade, empresa.uf].filter(Boolean).join("/") || "sem cidade"} · cliente desde{" "}
          {empresa.criadoEm.toLocaleDateString("pt-BR")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/e/${empresa.id}/painel`} className="btn-principal">Abrir o app desta empresa</Link>
          <Link href={`/e/${empresa.id}/ajustes`} className="btn-secundario">Dados e tipo de negócio</Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-titulo text-lg font-bold">Módulos</h2>
        <div className="cartao">
          <FormModulos acao={salvarModulos.bind(null, empresa.id)} ligados={[...modulos]} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-titulo text-lg font-bold">Pessoas com acesso</h2>
        <ul className="cartao divide-y divide-borda !p-0">
          {membros.map((m) => (
            <li key={m.usuarioId} className="space-y-1 px-4 py-3">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{m.nome}</span>
                <span className="text-xs text-suave">{NOME_PAPEL[m.papel]}</span>
              </p>
              <p className="text-sm text-suave">{m.email}</p>
              <BotaoRedefinirSenha acao={redefinirSenhaAdmin.bind(null, empresa.id, m.usuarioId)} nome={m.nome} />
            </li>
          ))}
        </ul>
        <details className="cartao">
          <summary className="cursor-pointer font-medium">+ Adicionar pessoa</summary>
          <div className="mt-4">
            <FormPessoaAdmin acao={adicionarPessoaAdmin.bind(null, empresa.id)} />
          </div>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="font-titulo text-lg font-bold">Últimas ações</h2>
        {eventos.length === 0 ? (
          <p className="text-sm text-suave">Nada registrado ainda.</p>
        ) : (
          <ul className="cartao divide-y divide-borda !p-0 text-sm">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs">{ev.acao}</span>
                  <span className="text-suave"> · {ev.quem ?? ATOR[ev.ator]}{ev.quem && ATOR[ev.ator] ? ` (${ATOR[ev.ator]})` : ""}</span>
                </span>
                <span className="shrink-0 text-xs text-suave">{ev.criadoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
