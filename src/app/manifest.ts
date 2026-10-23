import type { MetadataRoute } from "next";

/** Permite instalar o urutau na tela inicial do celular, abrindo em tela cheia. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "urutau gestão",
    short_name: "urutau",
    description: "As contas da sua empresa, numa tela só.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141B34",
    theme_color: "#141B34",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
