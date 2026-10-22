import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/servidor/auth";

export default async function Inicio() {
  redirect((await obterUsuarioAtual()) ? "/empresas" : "/entrar");
}
