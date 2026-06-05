#!/usr/bin/env python3
"""Check vozpro-app status on Oracle."""
import paramiko

key = paramiko.RSAKey.from_private_key_file("/home/z/my-project/upload/ssh-key-oracle.key")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("147.15.77.137", username="ubuntu", pkey=key, timeout=15)

cmds = [
    "ls -la /var/www/vozpro-app/",
    "ls /var/www/vozpro-app/src/app/ 2>/dev/null || echo 'No src/app'",
    "head -5 /var/www/vozpro-app/package.json 2>/dev/null || echo 'No package.json'",
    "ls /etc/nginx/sites-enabled/ 2>/dev/null || echo 'Sem nginx sites'",
    "apache2ctl -S 2>/dev/null || echo 'Sem Apache vhosts'",
]
for cmd in cmds:
    print(f"=== {cmd} ===")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
    print(stdout.read().decode()[:500])
    print()

c.close()
