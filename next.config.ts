/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Configuração de build do Next.js.
 *
 * ATENÇÃO MODELO DE IA: Este arquivo controla como o Next.js compila.
 * 1. 'output: standalone' é OBRIGATÓRIO para PM2 funcionar no Oracle.
 * 2. NUNCA remova output: standalone — o PM2 usa .next/standalone/server.js.
 * 3. NUNCA altere portas ou basePath sem coordenação com nginx.
 * 4. Deploy via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "public.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.hf.space",
      },
    ],
  },
};

export default nextConfig;
