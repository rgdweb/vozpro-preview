/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = "https://vozpro.cvmnews.com.br";

export const metadata: Metadata = {
  title: "VozPro - Sintetizador de Voz Profissional com IA",
  description: "Crie vozes profissionais com IA. Clonagem de voz, emoções e trilhas musicais para suas propagandas e conteúdos.",
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: "VozPro - Sintetizador de Voz Profissional com IA",
    description: "Crie vozes profissionais com IA. Clonagem de voz, emoções e trilhas musicais para suas propagandas e conteúdos.",
    url: APP_URL,
    siteName: "VozPro",
    images: [
      {
        url: "/og-image.jpg?v=2",
        width: 1200,
        height: 630,
        alt: "VozPro - Vozes Profissionais com IA",
        type: "image/jpeg",
        secureUrl: "https://vozpro.cvmnews.com.br/og-image.jpg?v=2",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VozPro - Sintetizador de Voz Profissional com IA",
    description: "Crie vozes profissionais com IA. Clonagem de voz, emoções e trilhas musicais para suas propagandas e conteúdos.",
    images: ["/og-image.jpg?v=2"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
