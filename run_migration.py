"""
Executar apenas a migration SQL de defaultSpeed no Oracle
"""
import paramiko

SSH_KEY = "/home/z/my-project/upload/ssh-key-oracle.key"
ORACLE_HOST = "147.15.77.137"
ORACLE_USER = "ubuntu"
NEXTJS_DIR = "/home/ubuntu/omnivoice"

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    ssh.connect(ORACLE_HOST, username=ORACLE_USER, pkey=key, timeout=30)

    # Criar script Node.js que le .env e executa SQL direto
    script = r'''
const fs = require('fs');
const path = require('path');

// Ler .env manualmente
const envPath = path.join('/home/ubuntu/omnivoice', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrl = envContent.split('\n')
  .find(l => l.startsWith('DATABASE_URL='))
  ?.replace('DATABASE_URL=', '')
  .trim();

if (!dbUrl) { console.error('DATABASE_URL not found'); process.exit(1); }
console.log('DB URL found: ' + dbUrl.substring(0, 30) + '...');

// Usar require do prisma client gerado
try {
  // Método 1: Prisma raw query
  const { PrismaClient } = require('/home/ubuntu/omnivoice/node_modules/@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  
  (async () => {
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "VoiceVariation" ADD COLUMN IF NOT EXISTS "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0');
      console.log('OK: defaultSpeed column added');
    } catch(e) {
      if (e.message.includes('already exists') || e.code === '42701') {
        console.log('OK: Column already exists');
      } else {
        console.error('ERR:', e.message, e.code);
      }
    }
    await prisma.$disconnect();
  })();
} catch(e2) {
  console.error('Prisma error:', e2.message);
  
  // Método 2: pg direto
  try {
    const { Client } = require('/home/ubuntu/omnivoice/node_modules/pg');
    const client = new Client(dbUrl);
    client.connect().then(() => {
      return client.query('ALTER TABLE "VoiceVariation" ADD COLUMN IF NOT EXISTS "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0');
    }).then(r => {
      console.log('OK (pg):', r.command);
      client.end();
    }).catch(e => {
      if (e.message.includes('already exists') || e.code === '42701') {
        console.log('OK (pg): Column already exists');
      } else {
        console.error('ERR (pg):', e.message, e.code);
      }
      client.end();
    });
  } catch(e3) {
    console.error('pg not available:', e3.message);
  }
}
'''

    # Enviar script
    sftp = ssh.open_sftp()
    script_path = '/tmp/migrate_default_speed.js'
    with sftp.open(script_path, 'w') as f:
        f.write(script)
    sftp.close()

    print("Executando migration...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {NEXTJS_DIR} && node {script_path} 2>&1")
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"Exit: {exit_code}")
    print(f"Out: {out}")
    if err:
        print(f"Err: {err}")

    ssh.exec_command(f"rm -f {script_path}")
    ssh.close()

if __name__ == "__main__":
    main()
