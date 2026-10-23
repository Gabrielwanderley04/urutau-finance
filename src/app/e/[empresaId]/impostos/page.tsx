import Link from "next/link";
import { AVISO_ESTIMATIVA, DetalheMei, DetalhePresumido, DetalheSimples } from "@/components/ImpostoDetalhe";
import { SeletorMes } from "@/components/SeletorMes";
import { Valor } from "@/components/Valor";
import { obterDb } from "@/db";
import { mesAtual, mesDe, mesValido, nomeDoMes } from "@/lib/datas";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { impostoDoMes } from "@/lib/servidor/fiscal";

export const metadata = { title: "Impostos" };

const NOME_REGIME = { mei: "MEI", simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real" } as const;

export default async function Impostos({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const { empresa, papel } = await exigirAcesso(empresaId, "ver_painel");
  const atual = mesAtual();
  const mes = mesValido(sp.mes) ? sp.mes : atual;
  const db = obterDb();
  await prepararEmpresa(db, empresa, mes, atual);
  const { imposto, series } = await impostoDoMes(db, empresa, mes);
  const base = `/e/${empresaId}`;

  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl font-bold">Impostos</h1>
      <SeletorMes mes={mes} base={`${base}/impostos`} mesAtual={atual} />

      <section className="cartao">
        <p className="text-sm text-suave">
          {NOME_REGIME[empresa.regime]} · imposto estimado de {nomeDoMes(mes)}
        </p>
        {imposto.total !== null ? (
          <Valor centavos={imposto.total} tamanho="xl" destaque />
        ) : (
          <p className="numero mt-1 text-3xl font-bold text-suave">—</p>
        )}
        <p className="mt-2 text-sm font-medium">⚠ {AVISO_ESTIMATIVA}</p>
      </section>

      {imposto.regime === "simples" && (
        <DetalheSimples r={imposto} mes={mes} series={series} base={base} inicioAtividade={empresa.inicioAtividade ? mesDe(empresa.inicioAtividade) : null} />
      )}
      {imposto.regime === "mei" && <DetalheMei r={imposto} />}
      {imposto.regime === "presumido" && <DetalhePresumido r={imposto} base={base} />}
      {imposto.regime === "real" && (
        <p className="aviso">Cálculo disponível em breve. Consulte seu contador.</p>
      )}
      {imposto.regime === "erro" && (
        <p className="rounded-xl border border-negativo bg-negativo-fundo p-3 text-sm text-negativo">
          ▼ Não foi possível calcular: {imposto.mensagem}
        </p>
      )}

      {pode(papel, "gerenciar") && (
        <p className="text-sm text-suave">
          Regime ou anexo errado? <Link href={`${base}/ajustes`} className="underline">Corrija nos dados da empresa</Link>.
        </p>
      )}
    </div>
  );
}
