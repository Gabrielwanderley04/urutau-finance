import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { FormAuth } from "../FormAuth";

export const metadata = { title: "Criar conta" };

export default async function CriarConta() {
  if (await obterUsuarioAtual()) redirect("/empresas");
  return <FormAuth modo="criar" />;
}
