import { formatarReais } from "@/lib/dinheiro";

const TAMANHOS = {
  sm: "text-base",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl sm:text-5xl",
} as const;

/**
 * Exibe um valor em reais. Negativos ficam em vermelho, com sinal "−" e um
 * marcador ▼, para não depender só da cor.
 */
export function Valor({
  centavos,
  tamanho = "md",
  destaque = false,
  sinalPositivo = false,
  className = "",
}: {
  centavos: number;
  tamanho?: keyof typeof TAMANHOS;
  destaque?: boolean;
  sinalPositivo?: boolean;
  className?: string;
}) {
  const negativo = centavos < 0;
  // "R$" menor que o número: o valor cabe em cartões estreitos e o número ganha destaque.
  const texto = formatarReais(Math.abs(centavos)).replace(/^R\$\s*/, "");
  const cor = negativo ? "text-negativo" : destaque ? "text-destaque-texto" : "";
  return (
    <span className={`numero font-bold whitespace-nowrap ${TAMANHOS[tamanho]} ${cor} ${className}`}>
      {negativo && (
        <span aria-hidden className="mr-1 text-[0.6em] align-middle">▼</span>
      )}
      {negativo ? <span aria-label="menos">−</span> : sinalPositivo && centavos > 0 ? "+" : ""}
      <span className="mr-[0.15em] text-[0.6em] font-medium">R$</span>
      {texto}
    </span>
  );
}
