import { Cabecalho } from "@/components/Campos";
import { FormEmpresa } from "@/components/FormEmpresa";
import { criarEmpresaAdmin } from "@/lib/servidor/acoes-admin";

export const metadata = { title: "Nova empresa" };

export default function NovaEmpresaAdmin() {
  return (
    <>
      <Cabecalho titulo="Nova empresa" voltar="/admin" />
      <FormEmpresa acao={criarEmpresaAdmin} textoBotao="Criar empresa" comDono />
    </>
  );
}
