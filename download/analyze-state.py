#!/usr/bin/env python3
"""ANALYSIS ONLY - check current state of Oracle server. Does NOT change anything."""
import paramiko
import json

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

def run(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("=== ANALISE DO ESTADO ATUAL DO ORACLE (read-only) ===\n")

    # 1. Site health check
    print("--- 1. Site esta no ar? ---")
    out, _ = run(client, "curl -s -o /dev/null -w 'HTTP %{http_code} | Size: %{size_download} bytes | Time: %{time_total}s' 'http://localhost:3000/' --max-time 10")
    print(f"  Homepage: {out}")
    out, _ = run(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' 'http://localhost:3000/api/voices' --max-time 10")
    print(f"  API voices: {out}")
    out, _ = run(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' 'http://localhost:3000/api/status' --max-time 10")
    print(f"  API status: {out}")

    # 2. PM2 status
    print("\n--- 2. PM2 Status ---")
    out, _ = run(client, "sudo PM2_HOME=/root/.pm2 pm2 list 2>&1")
    print(out)

    # 3. File sizes and timestamps (to compare with git versions)
    print("\n--- 3. Arquivos fonte (tamanho + timestamp) ---")
    files = [
        "src/app/page.tsx",
        "src/app/admin/page.tsx",
        "src/lib/audio-server.ts",
        "src/app/api/upload-voice/route.ts",
        "src/app/api/voices/[id]/variations/route.ts",
        "src/app/api/queue/join/route.ts",
        "src/app/api/queue/complete/route.ts",
        "prisma/schema.prisma",
        "src/lib/voice-analyzer.ts",         # NEW file
        "src/app/api/admin/analyze-voices/route.ts",  # NEW file
        "src/components/payment-dialog.tsx",  # NEW file (mistake)
    ]
    out, _ = run(client, f"cd {REMOTE_DIR} && for f in {' '.join(files)}; do if [ -f \"$f\" ]; then stat --printf='%s bytes | modified: %y | ' \"$f\" 2>/dev/null; echo \"$f\"; else echo 'NOT FOUND | '$f; fi; done")
    for line in out.split('\n'):
        print(f"  {line}")

    # 4. Check first/last lines of key files to identify version
    print("\n--- 4. Identificar versao dos arquivos chave ---")

    # page.tsx - check for voice analyzer integration
    out, _ = run(client, f"grep -c 'defaultSpeed\\|voiceAnalysis\\|applyVariationSpeed' {REMOTE_DIR}/src/app/page.tsx 2>/dev/null || echo 0")
    print(f"  page.tsx mentions of voice analysis: {out.strip()}")

    # admin/page.tsx - check for voice analyzer integration
    out, _ = run(client, f"grep -c 'defaultSpeed\\|voiceAnalysis\\|detectedSpeed' {REMOTE_DIR}/src/app/admin/page.tsx 2>/dev/null || echo 0")
    print(f"  admin/page.tsx mentions of voice analysis: {out.strip()}")

    # schema.prisma - check for defaultSpeed
    out, _ = run(client, f"grep 'defaultSpeed' {REMOTE_DIR}/prisma/schema.prisma 2>/dev/null || echo 'NOT FOUND'")
    print(f"  schema.prisma defaultSpeed: {out.strip()}")

    # queue routes - check for timeout/promoteNext
    out, _ = run(client, f"grep -c 'promoteNext\\|180000\\|3 \\* 60' {REMOTE_DIR}/src/app/api/queue/join/route.ts 2>/dev/null || echo 0")
    print(f"  queue/join mentions of fixes: {out.strip()}")

    # 5. Build state
    print("\n--- 5. Build state ---")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/.next/standalone/server.js 2>/dev/null | awk '{{print $6, $7, $8, $9}}'")
    print(f"  standalone/server.js: {out.strip()}")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/.next/BUILD_ID 2>/dev/null && cat {REMOTE_DIR}/.next/BUILD_ID 2>/dev/null || echo 'no BUILD_ID'")
    print(f"  BUILD_ID: {out.strip()}")

    # 6. Permission issues
    print("\n--- 6. Permissoes .next ---")
    out, _ = run(client, f"find {REMOTE_DIR}/.next -user root 2>/dev/null | wc -l")
    print(f"  Arquivos .next owned by root: {out.strip()}")
    out, _ = run(client, f"find {REMOTE_DIR}/.next -user ubuntu 2>/dev/null | wc -l")
    print(f"  Arquivos .next owned by ubuntu: {out.strip()}")

    # 7. PM2 logs (last 10 lines)
    print("\n--- 7. PM2 Logs (last 10 lines) ---")
    out, _ = run(client, "sudo PM2_HOME=/root/.pm2 pm2 logs omnivoice --lines 10 --nostream 2>&1")
    for line in out.split('\n')[-12:]:
        print(f"  {line}")

    client.close()
    print("\n=== FIM DA ANALISE (nada foi alterado) ===")

if __name__ == '__main__':
    main()
