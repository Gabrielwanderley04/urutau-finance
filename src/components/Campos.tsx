export function Erro({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-negativo">
      {msg}
    </p>
  );
}

export function Campo({
  rotulo,
  nome,
  erro,
  dica,
  children,
}: {
  rotulo: string;
  nome: string;
  erro?: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={nome} className="rotulo">
        {rotulo}
      </label>
      {children}
      {dica && !erro && <p className="mt-1 text-xs text-suave">{dica}</p>}
      <Erro msg={erro} />
    </div>
  );
}

export function Cabecalho({ titulo, voltar, acao }: { titulo: string; voltar?: string; acao?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-center gap-3">
      {voltar && (
        <a href={voltar} aria-label="Voltar" className="btn-secundario !min-h-10 !px-3">
          ‹
        </a>
      )}
      <h1 className="flex-1 font-titulo text-2xl font-bold">{titulo}</h1>
      {acao}
    </header>
  );
}
