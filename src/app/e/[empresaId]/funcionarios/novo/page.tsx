import { Cabecalho } from "@/components/Campos";
import { FormFuncionario } from "@/components/FormFuncionario";
import { obterDb } from "@/db";
import { hoje, mesAtual } from "@/lib/datas";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { salvarFuncionario } from "@/lib/servidor/acoes-funcionarios";
import { contextoFolha } from "@/lib/servidor/folha";

export const metadata = { title: "Novo funcionário" };

export default async function NovoFuncionario({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { empresa } = await exigirAcesso(empresaId, "gerenciar");
  const { aliquotas, encargos } = await contextoFolha(obterDb(), empresa, hoje());
  return (
    <>
      <Cabecalho titulo="Novo funcionário" voltar={`/e/${empresaId}/funcionarios`} />
      <FormFuncionario
        acao={salvarFuncionario.bind(null, empresaId, null)}
        aliquotas={aliquotas}
        encargos={encargos}
        inicial={{ nome: "", cargo: "", salario: "", admissao: hoje(), desligamento: "", vt: "", vr: "", planoSaude: "", outros: "", folhaDesde: mesAtual() }}
      />
    </>
  );
}
