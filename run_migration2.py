"""
Executar migration com sudo
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

    script = r'''
const fs = require('fs');
const path = require('path');

const envPath = '/home/ubuntu/omnivoice/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrl = envContent.split('\n')
  .find(l => l.startsWith('DATABASE_URL='))
  ?.replace('DATABASE_URL=', '')
  .trim();

if (!dbUrl) { console.error('DATABASE_URL not found'); process.exit(1); }
console.log('DB URL: ' + dbUrl.substring(0, 40) + '...');

const { PrismaClient } = require('/home/ubuntu/omnivoice/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: dbUrl });

(async () => {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "VoiceVariation" ADD COLUMN IF NOT EXISTS "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0');
    console.log('OK: defaultSpeed column added successfully');
  } catch(e) {
    if (e.message.includes('already exists') || e.code === '42701') {
      console.log('OK: Column already exists');
    } else {
      console.error('ERR:', e.message, 'code:', e.code);
    }
  }
  await prisma.$disconnect();
})();
'''

    sftp = ssh.open_sftp()
    script_path = '/tmp/migrate_default_speed.js'
    with sftp.open(script_path, 'w') as f:
        f.write(script)
    sftp.close()

    print("Executando migration (com sudo)...")
    stdin, stdout, stderr = ssh.exec_command(f"sudo node {script_path} 2>&1")
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"Exit: {exit_code}")
    print(f"Out: {out}")
    if err:
        print(f"Err: {err}")

    # Verificar se a coluna existe
    print("\nVerificando coluna...")
    verify_script = r'''
const fs = require('fs');
const envContent = fs.readFileSync('/home/ubuntu/omnivoice/.env', 'utf8');
const dbUrl = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='))?.replace('DATABASE_URL=', '').trim();
const { PrismaClient } = require('/home/ubuntu/omnivoice/node_modules/@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: dbUrl });
(async () => {
  const r = await prisma.$queryRawUnsafe("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'VoiceVariation' AND column_name = 'defaultSpeed'");
  console.log(JSON.stringify(r));
  await prisma.$disconnect();
})();
'''
    with sftp.open('/tmp/verify_migration.js', 'w') as f:
        f.write(verify_script)
    sftp.close()

    stdin, stdout, stderr = ssh.exec_command(f"sudo node /tmp/verify_migration.js 2>&1")
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    print(f"Verificação: {out}")

    ssh.exec_command("sudo rm -f /tmp/migrate_default_speed.js /tmp/verify_migration.js")
    ssh.close()

if __name__ == "__main__":
    main()
