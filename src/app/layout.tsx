import type { Metadata, Viewport } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const titulo = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--fonte-titulo" });
const texto = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--fonte-texto" });

export const metadata: Metadata = {
  title: { default: "urutau gestão", template: "%s · urutau gestão" },
  description: "Gestão financeira simples para pequenas empresas",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141B34",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tema = (await cookies()).get("tema")?.value;
  return (
    <html
      lang="pt-BR"
      data-theme={tema === "claro" || tema === "escuro" ? tema : undefined}
      className={`${titulo.variable} ${texto.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
