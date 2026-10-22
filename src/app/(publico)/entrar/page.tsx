import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";
import { FormAuth } from "../FormAuth";

export const metadata = { title: "Entrar" };

export default async function Entrar() {
  if (await obterUsuarioAtual()) redirect("/empresas");
  return <FormAuth modo="entrar" />;
}
