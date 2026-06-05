#!/bin/bash
# Wrapper para comandos Prisma que funciona mesmo quando o .env parsing falha
# Uso: ./scripts/db-push.sh
#       ./scripts/db-push.sh [comando prisma adicional, ex: "studio"]
export DATABASE_URL='postgresql://neondb_owner:npg_8jNPdgtB3kQD@ep-blue-band-ac85wa8e-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require'
exec npx prisma "$@"
