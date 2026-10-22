import type { ErrosFormulario } from "@/lib/validacao";

/** Estado devolvido pelas server actions aos formulários (useActionState). */
export interface EstadoForm {
  erros?: ErrosFormulario;
  valores?: Record<string, string>;
  ok?: string;
}
