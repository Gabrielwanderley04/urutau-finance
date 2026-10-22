import { formatarPcm, formatarReais, razaoPcm } from "@/lib/dinheiro";

export interface ItensCusto {
  salario: number;
  fgts: number;
  provisao13: number;
  provisaoFerias: number;
  fgtsProvisoes: number;
  inssPatronal: number;
  rat: number;
  terceiros: number;
  beneficios: number;
  total: number;
}

/** "Recebe R$ X e custa R$ Y" com a composição explicada linha a linha. */
export function ComposicaoCusto({ c, titulo = "Custo real por mês" }: { c: ItensCusto; titulo?: string }) {
  const extra = c.total - c.salario;
  const pct = razaoPcm(extra, c.salario);
  const linhas: [string, number, string][] = [
    ["Salário bruto", c.salario, "O que está na carteira"],
    ["FGTS (8%)", c.fgts, "Depositado todo mês na conta do FGTS"],
    ["Reserva para o 13º", c.provisao13, "1/12 do salário guardado por mês"],
    ["Reserva para férias + 1/3", c.provisaoFerias, "1/12 do salário com o terço de férias"],
    ["FGTS sobre 13º e férias", c.fgtsProvisoes, "8% sobre as reservas"],
    ["INSS patronal", c.inssPatronal, "Contribuição da empresa ao INSS"],
    ["RAT", c.rat, "Seguro de acidente de trabalho"],
    ["Terceiros (Sistema S)", c.terceiros, "SESC, SENAC, SEBRAE, salário-educação…"],
    ["Benefícios", c.beneficios, "VT, VR, plano de saúde"],
  ];
  return (
    <section className="cartao">
      <h2 className="mb-1 font-titulo text-lg font-bold">{titulo}</h2>
      <p className="mb-3 text-sm leading-relaxed">
        Recebe <strong className="numero">{formatarReais(c.salario)}</strong> e custa{" "}
        <strong className="numero text-destaque-texto">{formatarReais(c.total)}</strong> para a empresa
        {pct !== null && extra > 0 && <> ({formatarPcm(pct, 0)} a mais)</>}.
      </p>
      <dl className="divide-y divide-borda text-sm">
        {linhas
          .filter(([, v], i) => v > 0 || i < 5)
          .map(([nome, v, dica]) => (
            <div key={nome} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt>
                {nome}
                <span className="block text-xs text-suave">{dica}</span>
              </dt>
              <dd className="numero shrink-0">{formatarReais(v)}</dd>
            </div>
          ))}
        <div className="flex justify-between gap-3 pt-2 font-bold">
          <dt>Custo total</dt>
          <dd className="numero">{formatarReais(c.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
