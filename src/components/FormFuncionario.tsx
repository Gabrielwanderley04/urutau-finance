"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { ComposicaoCusto } from "@/components/ComposicaoCusto";
import { type AliquotasFolha, type Encargos, calcularCustoFuncionario } from "@/lib/calculos/folha";
import { lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";

export interface FuncionarioInicial {
  nome: string;
  cargo: string;
  salario: string;
  admissao: string;
  desligamento: string;
  vt: string;
  vr: string;
  planoSaude: string;
  outros: string;
  folhaDesde: string;
}

const CAMPOS_VALOR = ["salario", "vt", "vr", "planoSaude", "outros"] as const;

export function FormFuncionario({
  acao,
  inicial,
  aliquotas,
  encargos,
  somenteLeitura = false,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  inicial: FuncionarioInicial;
  aliquotas: AliquotasFolha;
  encargos: Encargos;
  somenteLeitura?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = { ...inicial, ...estado.valores };
  const [valores, setValores] = useState(() => Object.fromEntries(CAMPOS_VALOR.map((k) => [k, v[k] ?? ""])) as Record<(typeof CAMPOS_VALOR)[number], string>);

  const n = (k: (typeof CAMPOS_VALOR)[number]) => Math.max(0, lerReais(valores[k]) ?? 0);
  const salario = n("salario");
  const previa =
    salario > 0
      ? calcularCustoFuncionario(salario, { valeTransporte: n("vt"), valeRefeicao: n("vr"), planoSaude: n("planoSaude"), outros: n("outros") }, encargos, aliquotas)
      : null;

  const campoValor = (k: (typeof CAMPOS_VALOR)[number], rotulo: string, dica?: string) => (
    <Campo rotulo={rotulo} nome={k} erro={e[k]} dica={dica}>
      <input id={k} name={k} inputMode="decimal" autoComplete="off" placeholder="0,00" className="campo numero" value={valores[k]}
        onChange={(ev) => setValores((s) => ({ ...s, [k]: ev.target.value }))} />
    </Campo>
  );

  return (
    <form action={enviar} className="space-y-5">
      <fieldset disabled={somenteLeitura || pendente} className="space-y-5">
        <Campo rotulo="Nome" nome="nome" erro={e.nome}>
          <input id="nome" name="nome" className="campo" required defaultValue={v.nome} />
        </Campo>
        <Campo rotulo="Cargo" nome="cargo" erro={e.cargo}>
          <input id="cargo" name="cargo" className="campo" defaultValue={v.cargo} placeholder="Ex.: atendente" />
        </Campo>
        <Campo rotulo="Salário bruto (R$)" nome="salario" erro={e.salario} dica="O valor da carteira, antes dos descontos">
          <input id="salario" name="salario" inputMode="decimal" autoComplete="off" placeholder="0,00" required className="campo numero !text-2xl font-bold"
            value={valores.salario} onChange={(ev) => setValores((s) => ({ ...s, salario: ev.target.value }))} />
        </Campo>

        <fieldset className="cartao space-y-4">
          <legend className="px-1 font-titulo font-bold">Benefícios por mês</legend>
          <p className="-mt-2 text-xs text-suave">Informe quanto a <strong>empresa</strong> paga, já descontada a parte do funcionário (ex.: até 6% do salário no VT).</p>
          <div className="grid grid-cols-2 gap-3">
            {campoValor("vt", "Vale-transporte")}
            {campoValor("vr", "Vale-refeição")}
            {campoValor("planoSaude", "Plano de saúde")}
            {campoValor("outros", "Outros")}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Admissão" nome="admissao" erro={e.admissao}>
            <input id="admissao" name="admissao" type="date" required className="campo" defaultValue={v.admissao} />
          </Campo>
          <Campo rotulo="Desligamento" nome="desligamento" erro={e.desligamento} dica="Só se saiu">
            <input id="desligamento" name="desligamento" type="date" className="campo" defaultValue={v.desligamento} />
          </Campo>
        </div>
        <Campo rotulo="Calcular a folha a partir de" nome="folhaDesde" erro={e.folhaDesde}
          dica="Meses antes deste não são gerados, para não duplicar salários que você já lançou como despesa.">
          <input id="folhaDesde" name="folhaDesde" type="month" required className="campo" defaultValue={v.folhaDesde} />
        </Campo>

        {previa && <ComposicaoCusto c={previa} titulo="Prévia do custo mensal" />}

        <Erro msg={e._} />
        {!somenteLeitura && <button className="btn-principal w-full">{pendente ? "Salvando…" : "Salvar funcionário"}</button>}
      </fieldset>
    </form>
  );
}
