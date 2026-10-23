import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer"],
  // As fontes do PDF são lidas do disco em tempo de execução: precisam ir junto na publicação.
  outputFileTracingIncludes: {
    "/e/[empresaId]/relatorios/arquivo/[nome]": [
      "./node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff",
      "./node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff",
      "./node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff",
    ],
  },
};

export default nextConfig;
