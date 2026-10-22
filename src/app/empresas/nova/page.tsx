import { Cabecalho } from "@/components/Campos";
import { FormEmpresa } from "@/components/FormEmpresa";
import { criarEmpresa } from "@/lib/servidor/empresas";
import { exigirUsuario } from "@/lib/servidor/auth";

export const metadata = { title: "Nova empresa" };

export default async function NovaEmpresa() {
  await exigirUsuario();
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Cabecalho titulo="Sua empresa" voltar="/empresas" />
      <p className="mb-6 text-suave">
        Com estes dados calculamos seus impostos estimados. Já criamos categorias de despesa e fontes de venda
        padrão, e você pode mudar tudo depois.
      </p>
      <FormEmpresa acao={criarEmpresa} textoBotao="Criar empresa" />
    </main>
  );
}
