"use client";

import { useActionState, useState } from "react";
import { Campo, Erro } from "@/components/Campos";
import { Opcoes } from "@/components/Opcoes";
import { gerarCronograma } from "@/lib/calculos/dividas";
import { dataValida, formatarData, hoje } from "@/lib/datas";
import { formatarReais, lerPercentual, lerReais } from "@/lib/dinheiro";
import type { EstadoForm } from "@/lib/estado-form";
import { NOME_TIPO_DIVIDA } from "@/lib/textos-dividas";

export function FormDivida({ acao }: { acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm> }) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const e = estado.erros ?? {};
  const ini = estado.valores ?? {};
  const [f, setF] = useState({
    tipo: ini.tipo ?? "emprestimo",
    valorOriginal: ini.valorOriginal ?? "",
    juros: ini.juros ?? "",
    numParcelas: ini.numParcelas ?? "",
    valorParcela: ini.valorParcela ?? "",
    primeiroVencimento: ini.primeiroVencimento ?? "",
  });
  const mudar = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: ev.target.value }));

  const valor = lerReais(f.valorOriginal);
  const juros = f.juros.trim() ? lerPercentual(f.juros) : 0;
  const n = Number(f.numParcelas);
  const parcelaInformada = f.valorParcela.trim() ? lerReais(f.valorParcela) : null;
  const previa =
    valor && valor > 0 && juros !== null && Number.isInteger(n) && n >= 1 && n <= 600 && dataValida(f.primeiroVencimento)
      ? gerarCronograma({ saldoDevedor: valor, jurosMensais: juros, numParcelas: n, valorParcela: parcelaInformada, primeiroVencimento: f.primeiroVencimento, diaVencimento: Number(f.primeiroVencimento.slice(8)) })
      : null;
  const hojeData = hoje();
  const pagasAteHoje = previa?.parcelas.filter((p) => p.vencimento < hojeData).length ?? 0;

  return (
    <form action={enviar} className="space-y-5">
      <Campo rotulo="Para quem a empresa deve?" nome="credor" erro={e.credor}>
        <input id="credor" name="credor" className="campo" required defaultValue={ini.credor} placeholder="Ex.: Banco do Brasil, fornecedor de farinha" />
      </Campo>
      <div>
        <span className="rotulo">Tipo</span>
        <Opcoes nome="tipo" opcoes={Object.entries(NOME_TIPO_DIVIDA).map(([v, nome]) => ({ v, nome }))} valor={f.tipo} aoMudar={(v) => setF((s) => ({ ...s, tipo: v }))} colunas={2} />
        <Erro msg={e.tipo} />
      </div>
      <Campo rotulo="Valor contratado (R$)" nome="valorOriginal" erro={e.valorOriginal} dica="O valor que entrou ou o total da compra parcelada">
        <input id="valorOriginal" name="valorOriginal" inputMode="decimal" required className="campo numero !text-2xl font-bold" value={f.valorOriginal} onChange={mudar("valorOriginal")} placeholder="0,00" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Juros ao mês (%)" nome="juros" erro={e.juros} dica="0 se não tiver juros">
          <input id="juros" name="juros" inputMode="decimal" className="campo" value={f.juros} onChange={mudar("juros")} placeholder="Ex.: 1,99" />
        </Campo>
        <Campo rotulo="Nº de parcelas" nome="numParcelas" erro={e.numParcelas}>
          <input id="numParcelas" name="numParcelas" inputMode="numeric" required className="campo" value={f.numParcelas} onChange={mudar("numParcelas")} placeholder="Ex.: 24" />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data da 1ª parcela" nome="primeiroVencimento" erro={e.primeiroVencimento} dica="As demais vencem no mesmo dia">
          <input id="primeiroVencimento" name="primeiroVencimento" type="date" required className="campo" value={f.primeiroVencimento} onChange={mudar("primeiroVencimento")} />
        </Campo>
        <Campo rotulo="Valor da parcela" nome="valorParcela" erro={e.valorParcela} dica="Opcional: deixe vazio para calcularmos">
          <input id="valorParcela" name="valorParcela" inputMode="decimal" className="campo numero" value={f.valorParcela} onChange={mudar("valorParcela")} placeholder="0,00" />
        </Campo>
      </div>

      {previa && (
        <section className="cartao space-y-2 text-sm">
          <h2 className="font-titulo text-lg font-bold">Como fica</h2>
          <p>
            {previa.parcelas.length}x de <strong className="numero text-destaque-texto">{formatarReais(previa.valorParcela)}</strong>
            {!parcelaInformada && juros ? " (tabela Price)" : ""}, terminando em <strong>{formatarData(previa.parcelas.at(-1)!.vencimento)}</strong>.
          </p>
          <p>
            Você vai pagar <strong className="numero">{formatarReais(previa.totalPago)}</strong>, sendo{" "}
            <strong className="numero text-negativo">{formatarReais(previa.totalJuros)}</strong> de juros.
          </p>
          {previa.parcelas.length > 0 && previa.parcelas[0].juros > 0 && (
            <p className="text-suave">
              Na 1ª parcela, {formatarReais(previa.parcelas[0].juros)} são juros (entram como despesa no lucro) e{" "}
              {formatarReais(previa.parcelas[0].amortizacao)} abatem a dívida (saem do caixa, mas não são despesa).
            </p>
          )}
          {previa.avisos.map((a, i) => (
            <p key={i} className="text-negativo">
              ▼{" "}
              {a.tipo === "parcela_menor_que_juros"
                ? `A parcela não cobre os juros do mês (${formatarReais(a.juros)}). A dívida nunca terminaria.`
                : a.tipo === "ajuste_ultima_parcela"
                  ? `O valor da parcela não fecha com essa taxa: a última parcela fica ${formatarReais(Math.abs(a.diferenca))} ${a.diferenca > 0 ? "maior" : "menor"}. Confira os números do contrato.`
                  : `Com essa parcela, a dívida termina em ${a.parcelas} parcelas.`}
            </p>
          ))}
          {pagasAteHoje > 0 && (
            <label className="flex gap-2 pt-1">
              <input type="checkbox" name="vencidasPagas" defaultChecked className="mt-0.5 h-5 w-5 accent-[var(--destaque)]" />
              <span>As {pagasAteHoje} parcelas que venceram antes de hoje já foram pagas</span>
            </label>
          )}
        </section>
      )}

      <Campo rotulo="Observação (opcional)" nome="observacao" erro={e.observacao}>
        <input id="observacao" name="observacao" className="campo" defaultValue={ini.observacao} placeholder="Ex.: contrato nº 123, garantia do forno" />
      </Campo>
      <Erro msg={e._} />
      <button className="btn-principal w-full" disabled={pendente}>{pendente ? "Salvando…" : "Cadastrar dívida"}</button>
    </form>
  );
}
