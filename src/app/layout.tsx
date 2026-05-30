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
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "VozPro - Vozes Profissionais com IA",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VozPro - Sintetizador de Voz Profissional com IA",
    description: "Crie vozes profissionais com IA. Clonagem de voz, emoções e trilhas musicais para suas propagandas e conteúdos.",
    images: ["/og-image.jpg"],
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
