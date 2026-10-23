"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { Opcoes } from "@/components/Opcoes";
import { centavosParaInput, formatarReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";

interface Sugestao {
  bruto: number;
  fgts: number;
  encargos: number;
  total: number;
}

export function FormProvisao({
  acao,
  sugestoes,
  hoje,
  avos,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  sugestoes: { decimo_terceiro: Sugestao; ferias: Sugestao };
  hoje: string;
  avos: number;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const [tipo, setTipo] = useState<"decimo_terceiro" | "ferias">("decimo_terceiro");
  const [valor, setValor] = useState(centavosParaInput(sugestoes.decimo_terceiro.total));
  const s = sugestoes[tipo];
  return (
    <form action={enviar} className="space-y-4" key={estado.ok}>
      <Opcoes
        nome="tipo"
        opcoes={[{ v: "decimo_terceiro", nome: "13º salário" }, { v: "ferias", nome: "Férias" }]}
        valor={tipo}
        aoMudar={(v) => {
          const t = v as typeof tipo;
          setTipo(t);
          setValor(centavosParaInput(sugestoes[t].total));
        }}
        colunas={2}
      />
      <p className="text-xs text-suave">
        Sugestão: {tipo === "decimo_terceiro" ? `${avos}/12 do salário` : "salário + 1/3"} {formatarReais(s.bruto)} + FGTS {formatarReais(s.fgts)}
        {s.encargos > 0 && ` + encargos ${formatarReais(s.encargos)}`} = <strong>{formatarReais(s.total)}</strong>. Ajuste se o valor pago foi outro.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor pago (R$)" nome="valor" erro={e.valor}>
          <input id="valor" name="valor" inputMode="decimal" className="campo numero" value={valor} onChange={(ev) => setValor(ev.target.value)} />
        </Campo>
        <Campo rotulo="Pago em" nome="pagoEm" erro={e.pagoEm}>
          <input id="pagoEm" name="pagoEm" type="date" className="campo" defaultValue={hoje} />
        </Campo>
      </div>
      <Campo rotulo="Observação (opcional)" nome="descricao" erro={e.descricao}>
        <input id="descricao" name="descricao" className="campo" placeholder="Ex.: 1ª parcela do 13º" />
      </Campo>
      <Erro msg={e._} />
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
      <button className="btn-secundario w-full" disabled={pendente}>{pendente ? "Registrando…" : "Registrar pagamento"}</button>
    </form>
  );
}
