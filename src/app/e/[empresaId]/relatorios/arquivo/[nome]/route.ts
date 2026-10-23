import { strToU8, zipSync } from "fflate";
import { obterDb } from "@/db";
import { hoje, mesAtual, mesValido } from "@/lib/datas";
import { gerarPdf } from "@/lib/relatorios/pdf";
import { SECOES, type Secao, csvDaSecao, nomeArquivo } from "@/lib/relatorios/secoes";
import { exigirPermissao } from "@/lib/servidor/acesso";
import { prepararEmpresa } from "@/lib/servidor/automaticos";
import { montarRelatorio } from "@/lib/servidor/relatorio";

export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string; nome: string }> }) {
  const { empresaId, nome } = await params;
  let ctx;
  try {
    ctx = await exigirPermissao(empresaId, "ver_painel");
  } catch {
    return new Response("Sem permissão", { status: 403 });
  }
  const mesParam = new URL(req.url).searchParams.get("mes");
  const mes = mesValido(mesParam) ? mesParam : mesAtual();
  const db = obterDb();
  await prepararEmpresa(db, ctx.empresa, mes);
  const r = await montarRelatorio(db, ctx.empresa, mes, hoje());

  const baixar = (corpo: BodyInit, tipo: string, arquivo: string) =>
    new Response(corpo, {
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `attachment; filename="${arquivo}"`,
        "Cache-Control": "no-store",
      },
    });

  if (nome === "relatorio.pdf") return baixar(new Uint8Array(await gerarPdf(r)), "application/pdf", nomeArquivo(r, "pdf"));
  if (nome === "todos.zip") {
    const arquivos = Object.fromEntries(SECOES.map((sec) => [nomeArquivo(r, "csv", sec), strToU8(csvDaSecao(r, sec))]));
    arquivos[nomeArquivo(r, "pdf")] = new Uint8Array(await gerarPdf(r));
    return baixar(new Uint8Array(zipSync(arquivos)), "application/zip", nomeArquivo(r, "zip"));
  }
  const secao = nome.replace(/\.csv$/, "") as Secao;
  if (nome.endsWith(".csv") && SECOES.includes(secao)) return baixar(csvDaSecao(r, secao), "text/csv; charset=utf-8", nomeArquivo(r, "csv", secao));
  return new Response("Arquivo não encontrado", { status: 404 });
}
