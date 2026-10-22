import { asc, eq } from "drizzle-orm";
import { BotaoAcao } from "@/components/BotaoAcao";
import { Cabecalho } from "@/components/Campos";
import { FormNovoMembro, SeletorPapel } from "@/components/Membros";
import { obterDb } from "@/db";
import { empresaUsuarios, usuarios } from "@/db/schema";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { adicionarMembro, mudarPapel, removerMembro } from "@/lib/servidor/acoes-ajustes";

export const metadata = { title: "Pessoas com acesso" };

export default async function Usuarios({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { usuario } = await exigirAcesso(empresaId, "gerenciar");
  const membros = await obterDb()
    .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: empresaUsuarios.papel })
    .from(empresaUsuarios)
    .innerJoin(usuarios, eq(usuarios.id, empresaUsuarios.usuarioId))
    .where(eq(empresaUsuarios.empresaId, empresaId))
    .orderBy(asc(usuarios.nome));
  return (
    <>
      <Cabecalho titulo="Pessoas com acesso" voltar={`/e/${empresaId}/mais`} />
      <ul className="cartao divide-y divide-borda !p-0">
        {membros.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{m.nome}{m.id === usuario.id && " (você)"}</span>
              <span className="block truncate text-sm text-suave">{m.email}</span>
            </span>
            <SeletorPapel papel={m.papel} mudar={mudarPapel.bind(null, empresaId, m.id)} />
            {m.id !== usuario.id && (
              <BotaoAcao acao={removerMembro.bind(null, empresaId, m.id)} className="text-sm text-negativo underline" confirmar={`Remover o acesso de ${m.nome}?`}>
                Remover
              </BotaoAcao>
            )}
          </li>
        ))}
      </ul>
      <section className="cartao mt-5">
        <h2 className="mb-3 font-titulo font-bold">Dar acesso a alguém</h2>
        <FormNovoMembro acao={adicionarMembro.bind(null, empresaId)} />
      </section>
    </>
  );
}
