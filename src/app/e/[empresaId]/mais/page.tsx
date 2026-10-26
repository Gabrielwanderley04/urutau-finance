import Link from "next/link";
import { AlternarTema } from "@/components/AlternarTema";
import { telaDoModulo } from "@/lib/perfis";
import { pode } from "@/lib/permissoes";
import { exigirAcesso } from "@/lib/servidor/acesso";
import { sair } from "@/app/(publico)/acoes";

export const metadata = { title: "Mais" };

export default async function Mais({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { papel, usuario, empresa, modulos } = await exigirAcesso(empresaId);
  const base = `/e/${empresaId}`;
  const gerencia = pode(papel, "gerenciar");
  const itens: { href?: string; titulo: string; desc: string; fase?: number }[] = [
    ...(pode(papel, "conferir") ? [{ href: `${base}/conferir`, titulo: "Para conferir", desc: "Vendas que entraram sozinhas esperando o seu check" }] : []),
    ...(pode(papel, "ver_clientes") ? [{ href: `${base}/clientes`, titulo: "Clientes", desc: "Quem compra, com telefone e histórico" }] : []),
    // Módulos ligados que ainda não têm tela: aparecem como "em breve".
    ...(["agenda", "estoque", "whatsapp"] as const).filter((m) => modulos.has(m)).map((m) => telaDoModulo(empresa.perfil, m)),
    ...(pode(papel, "ver_painel")
      ? [
          { href: `${base}/contas`, titulo: "Contas a pagar e receber", desc: "Agenda de vencimentos e atrasos" },
          { href: `${base}/relatorios`, titulo: "Relatórios", desc: "Exportar o mês em CSV e PDF para o contador" },
          { href: `${base}/funcionarios`, titulo: "Funcionários", desc: "Quanto cada um custa de verdade" },
          { href: `${base}/dividas`, titulo: "Dívidas", desc: "Empréstimos, parcelas e juros" },
          { href: `${base}/impostos`, titulo: "Impostos", desc: "Estimativa explicada passo a passo" },
        ]
      : []),
    ...(gerencia
      ? [
          { href: `${base}/ajustes`, titulo: "Dados da empresa", desc: "Nome, CNPJ, regime tributário" },
          { href: `${base}/despesas/recorrentes`, titulo: "Despesas recorrentes", desc: "Aluguel, internet… gerados todo mês" },
          { href: `${base}/ajustes/categorias`, titulo: "Categorias de despesa", desc: "Nomes, fixas e variáveis" },
          { href: `${base}/ajustes/fontes`, titulo: "Fontes de receita", desc: "Loja, site, delivery…" },
          { href: `${base}/ajustes/historico`, titulo: "Faturamento anterior", desc: "Meses antes do urutau, para o cálculo do imposto" },
          { href: `${base}/ajustes/usuarios`, titulo: "Pessoas com acesso", desc: "Colaboradores e contador" },
        ]
      : []),
  ];
  return (
    <div className="space-y-3">
      <h1 className="font-titulo text-2xl font-bold">Mais</h1>
      <ul className="cartao divide-y divide-borda !p-0">
        {itens.map((i) => (
          <li key={i.titulo}>
            {i.href ? (
              <Link href={i.href} className="flex items-center justify-between px-4 py-3.5">
                <span>
                  <span className="block font-medium">{i.titulo}</span>
                  <span className="text-sm text-suave">{i.desc}</span>
                </span>
                <span aria-hidden className="text-xl text-suave">›</span>
              </Link>
            ) : (
              <div className="flex items-center justify-between px-4 py-3.5 opacity-60">
                <span>
                  <span className="block font-medium">{i.titulo}</span>
                  <span className="text-sm text-suave">{i.desc}</span>
                </span>
                <span className="rounded-full border border-borda px-2 py-0.5 text-xs">em breve</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <AlternarTema />
      <Link href="/empresas" className="btn-secundario w-full">Trocar de empresa</Link>
      <form action={sair}>
        <button className="btn-secundario w-full text-suave">Sair ({usuario.email})</button>
      </form>
    </div>
  );
}
