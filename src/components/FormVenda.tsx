"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { Opcoes } from "@/components/Opcoes";
import type { EstadoForm } from "@/lib/estado-form";
import { FORMAS_PAGAMENTO } from "@/lib/rotulos";

export interface VendaInicial {
  data: string;
  valor: string;
  descricao: string;
  fonteReceitaId: string;
  formaPagamento: string;
  status: string;
  dataRecebimento: string;
}

export function FormVenda({
  acao,
  fontes,
  inicial,
  somenteLeitura = false,
}: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  fontes: { id: string; nome: string }[];
  inicial: VendaInicial;
  somenteLeitura?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = { ...inicial, ...estado.valores };
  const [fonte, setFonte] = useState(v.fonteReceitaId);
  const [forma, setForma] = useState(v.formaPagamento);
  const [status, setStatus] = useState(v.status);

  return (
    <form action={enviar} className="space-y-5">
      <fieldset disabled={somenteLeitura || pendente} className="space-y-5">
        <Campo rotulo="Valor da venda (R$)" nome="valor" erro={e.valor}>
          <input id="valor" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00" required autoFocus={!inicial.valor}
            defaultValue={v.valor} className="campo numero !py-4 !text-3xl font-bold" />
        </Campo>

        <div>
          <span className="rotulo">De onde veio?</span>
          <Opcoes nome="fonteReceitaId" opcoes={fontes.map((f) => ({ v: f.id, nome: f.nome }))} valor={fonte} aoMudar={setFonte} colunas={2} />
          <Erro msg={e.fonteReceitaId} />
        </div>

        <div>
          <span className="rotulo">Como o cliente pagou?</span>
          <Opcoes nome="formaPagamento" opcoes={FORMAS_PAGAMENTO} valor={forma} aoMudar={setForma} />
          <Erro msg={e.formaPagamento} />
        </div>

        <div>
          <span className="rotulo">Já recebeu o dinheiro?</span>
          <Opcoes nome="status" opcoes={[{ v: "recebido", nome: "Sim, recebido" }, { v: "a_receber", nome: "Não, a receber" }]} valor={status} aoMudar={setStatus} colunas={2} />
          <Erro msg={e.status} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data da venda" nome="data" erro={e.data}>
            <input id="data" name="data" type="date" required defaultValue={v.data} className="campo" />
          </Campo>
          <Campo rotulo={status === "a_receber" ? "Vou receber em" : "Recebi em"} nome="dataRecebimento" erro={e.dataRecebimento}>
            <input id="dataRecebimento" name="dataRecebimento" type="date" defaultValue={v.dataRecebimento} required={status === "a_receber"} className="campo" />
          </Campo>
        </div>

        <Campo rotulo="Descrição (opcional)" nome="descricao" erro={e.descricao}>
          <input id="descricao" name="descricao" defaultValue={v.descricao} placeholder="Ex.: encomenda de bolo" className="campo" />
        </Campo>

        <Erro msg={e._} />
        {!somenteLeitura && (
          <button className="btn-principal w-full">{pendente ? "Salvando…" : "Salvar venda"}</button>
        )}
      </fieldset>
    </form>
  );
}
