"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import type { Empresa } from "@/db/schema";
import { formatarPcm } from "@/lib/dinheiro";
import { ORDEM_PERFIS, PERFIS } from "@/lib/perfis";
import type { EstadoForm } from "@/lib/estado-form";
import { UFS, formatarCnpj } from "@/lib/validacao";

const REGIMES = [
  { v: "mei", nome: "MEI", dica: "Faturamento de até R$ 81 mil por ano, imposto fixo mensal (DAS)." },
  { v: "simples", nome: "Simples Nacional", dica: "Uma guia mensal (DAS) com alíquota que cresce com o faturamento." },
  { v: "presumido", nome: "Lucro Presumido", dica: "Impostos sobre uma margem de lucro definida por lei." },
  { v: "real", nome: "Lucro Real", dica: "Impostos sobre o lucro contábil de verdade." },
];

const pctInput = (p: number | null | undefined) => (p == null ? "" : formatarPcm(p, 3).replace("%", ""));

export function FormEmpresa({
  acao,
  empresa,
  textoBotao,
  comDono = false,
}: {
  acao: (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  empresa?: Empresa;
  textoBotao: string;
  /** Painel Urutau: pede também quem é o dono (cria a conta se não existir). */
  comDono?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const v = estado.valores;
  const inicial = (campo: string, padrao: string) => v?.[campo] ?? padrao;

  const [atividade, setAtividade] = useState(inicial("atividade", empresa?.atividade ?? "comercio"));
  const [regime, setRegime] = useState(inicial("regime", empresa?.regime ?? "simples"));
  const [anexoServicos, setAnexoServicos] = useState(inicial("anexoServicos", empresa?.anexoServicos ?? ""));
  const temComercio = atividade !== "servicos";
  const temServicos = atividade !== "comercio";

  return (
    <form action={enviar} className="space-y-5">
      <Campo rotulo="Nome da empresa" nome="nome" erro={e.nome}>
        <input id="nome" name="nome" className="campo" required defaultValue={inicial("nome", empresa?.nome ?? "")} />
      </Campo>
      <Campo rotulo="Tipo de negócio" nome="perfil" erro={e.perfil} dica="Define a primeira tela, o menu e o que o atendente do WhatsApp sabe fazer.">
        <select id="perfil" name="perfil" className="campo" defaultValue={inicial("perfil", empresa?.perfil ?? "financas")}>
          {ORDEM_PERFIS.map((p) => <option key={p} value={p}>{PERFIS[p].nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="CNPJ (opcional)" nome="cnpj" erro={e.cnpj}>
        <input id="cnpj" name="cnpj" className="campo" inputMode="numeric" placeholder="00.000.000/0000-00"
          defaultValue={inicial("cnpj", formatarCnpj(empresa?.cnpj ?? null))} />
      </Campo>

      <fieldset>
        <legend className="rotulo">O que a empresa faz?</legend>
        <div className="grid grid-cols-3 gap-2">
          {[["comercio", "Vende produtos"], ["servicos", "Presta serviços"], ["ambos", "Os dois"]].map(([valor, rot]) => (
            <label key={valor} className={`btn-secundario !px-2 text-center text-sm ${atividade === valor ? "!border-destaque font-bold" : ""}`}>
              <input type="radio" name="atividade" value={valor} checked={atividade === valor} onChange={() => setAtividade(valor)} className="sr-only" />
              {rot}
            </label>
          ))}
        </div>
        <Erro msg={e.atividade} />
      </fieldset>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Campo rotulo="Cidade" nome="cidade" erro={e.cidade}>
          <input id="cidade" name="cidade" className="campo" defaultValue={inicial("cidade", empresa?.cidade ?? "")} />
        </Campo>
        <Campo rotulo="UF" nome="uf" erro={e.uf}>
          <select id="uf" name="uf" className="campo" defaultValue={inicial("uf", empresa?.uf ?? "")}>
            <option value="">—</option>
            {UFS.map((uf) => <option key={uf}>{uf}</option>)}
          </select>
        </Campo>
      </div>

      <Campo rotulo="Início das atividades" nome="inicioAtividade" erro={e.inicioAtividade}
        dica="Data de abertura do CNPJ. Usada no cálculo do imposto de empresas com menos de 12 meses.">
        <input id="inicioAtividade" name="inicioAtividade" type="date" className="campo" defaultValue={inicial("inicioAtividade", empresa?.inicioAtividade ?? "")} />
      </Campo>

      <fieldset>
        <legend className="rotulo">Regime tributário</legend>
        <div className="space-y-2">
          {REGIMES.map((r) => (
            <label key={r.v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${regime === r.v ? "border-2 border-destaque bg-superficie-2" : "border-borda bg-superficie"}`}>
              <input type="radio" name="regime" value={r.v} checked={regime === r.v} onChange={() => setRegime(r.v)} className="mt-1 accent-[var(--destaque)]" />
              <span>
                <span className="block font-medium">{r.nome}</span>
                <span className="block text-sm text-suave">{r.dica}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-suave">Não sabe? Pergunte ao seu contador. Dá para mudar depois.</p>
        <Erro msg={e.regime} />
      </fieldset>

      {regime === "simples" && (
        <div className="cartao space-y-4">
          <p className="text-sm text-suave">No Simples, o anexo define a tabela de impostos. Ele aparece no seu DAS ou no contrato social.</p>
          {temComercio && (
            <Campo rotulo="Anexo das vendas de produtos" nome="anexoComercio" erro={e.anexoComercio}>
              <select id="anexoComercio" name="anexoComercio" className="campo" defaultValue={inicial("anexoComercio", empresa?.anexoComercio ?? "I")}>
                <option value="I">Anexo I: comércio</option>
                <option value="II">Anexo II: indústria</option>
              </select>
            </Campo>
          )}
          {temServicos && (
            <>
              <Campo rotulo="Anexo dos serviços" nome="anexoServicos" erro={e.anexoServicos}>
                <select id="anexoServicos" name="anexoServicos" className="campo" value={anexoServicos} onChange={(ev) => setAnexoServicos(ev.target.value)}>
                  <option value="">Escolha…</option>
                  <option value="III">Anexo III: serviços em geral (manutenção, academias, agências…)</option>
                  <option value="IV">Anexo IV: limpeza, vigilância, obras, advocacia</option>
                  <option value="V">Anexo V: serviços intelectuais (consultoria, tecnologia…)</option>
                </select>
              </Campo>
              {(anexoServicos === "III" || anexoServicos === "V") && (
                <label className="flex gap-3 text-sm">
                  <input type="checkbox" name="sujeitoFatorR" defaultChecked={empresa?.sujeitoFatorR ?? false} className="mt-0.5 h-5 w-5 accent-[var(--destaque)]" />
                  <span>
                    Minha atividade depende do <strong>Fator R</strong>: se a folha de pagamento for 28% ou mais do faturamento, pago pelo Anexo III; se for menos, pelo Anexo V.
                  </span>
                </label>
              )}
            </>
          )}
        </div>
      )}

      {regime === "presumido" && (
        <div className="cartao grid grid-cols-2 gap-3">
          {temServicos && (
            <Campo rotulo="ISS (%)" nome="aliquotaIss" erro={e.aliquotaIss} dica="Entre 2% e 5%">
              <input id="aliquotaIss" name="aliquotaIss" className="campo" inputMode="decimal" defaultValue={inicial("aliquotaIss", pctInput(empresa?.aliquotaIssPcm))} />
            </Campo>
          )}
          {temComercio && (
            <Campo rotulo="ICMS (%)" nome="aliquotaIcms" erro={e.aliquotaIcms} dica="Alíquota efetiva média">
              <input id="aliquotaIcms" name="aliquotaIcms" className="campo" inputMode="decimal" defaultValue={inicial("aliquotaIcms", pctInput(empresa?.aliquotaIcmsPcm))} />
            </Campo>
          )}
        </div>
      )}

      {comDono && (
        <fieldset className="cartao space-y-4">
          <legend className="rotulo">Dono da empresa</legend>
          <Campo rotulo="Nome" nome="pessoaNome" erro={e.pessoaNome}>
            <input id="pessoaNome" name="pessoaNome" className="campo" required defaultValue={inicial("pessoaNome", "")} />
          </Campo>
          <Campo rotulo="E-mail de acesso" nome="pessoaEmail" erro={e.pessoaEmail} dica="Se ainda não tiver conta, criamos uma com senha provisória.">
            <input id="pessoaEmail" name="pessoaEmail" type="email" className="campo" required defaultValue={inicial("pessoaEmail", "")} />
          </Campo>
        </fieldset>
      )}

      <Erro msg={e._} />
      {estado.ok && <p role="status" className="text-sm text-positivo">✓ {estado.ok}</p>}
      <button className="btn-principal w-full" disabled={pendente}>{pendente ? "Salvando…" : textoBotao}</button>
    </form>
  );
}
