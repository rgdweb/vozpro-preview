/** 🚨 CONTRATO DE GOVERNANCA EXECUTIVA - VOZPRO (SaaS Hibrido)
 * 🚨 PROIBICOES ABSOLUTAS (13 erros ja cometidos que derrubaram o sistema):
 *   1. NUNCA git reset --hard | 2. NUNCA altere git remote | 3. NUNCA rm -rf
 *   4. NUNCA push syntax errors | 5. NUNCA commit .env real | 6. NUNCA temp no root
 *   7. NUNCA scripts deploy alternativos | 8. NUNCA quebre next.config | 9. queue: 3x, 3min
 *   10. NUNCA remova AUDIO_SERVER_API_KEY | 11. NUNCA desalinhe tokens .env/config.php
 *   12. NUNCA pm2 restart sozinho (faz rebuild) | 13. NUNCA git checkout -- .env
 * 🚨 REGRA UNICA DE DEPLOY: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 * 🚨 REGISTRO COMPLETO: REGRAS-ERROS-PROIBIDOS.md (leia ANTES de alterar qualquer coisa)
 * 🚨 IP: 147.15.77.137 | Repo: rgdweb/vozpro-preview | PM2: PM2_HOME=/root/.pm2
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
