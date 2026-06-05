import paramiko

key = paramiko.RSAKey.from_private_key_file('/home/z/.ssh/oracle_key')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('147.15.77.137', username='ubuntu', pkey=key, timeout=10)

stdin, stdout, stderr = ssh.exec_command('grep -c "selectedSpeakerFile" /home/ubuntu/omnivoice/src/app/page.tsx')
print("selectedSpeakerFile:", stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('grep -c "clone_fast" /home/ubuntu/omnivoice/src/app/page.tsx')
print("clone_fast:", stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('grep -c "VERSION: 2026" /home/ubuntu/omnivoice/src/app/page.tsx')
print("VERSION:", stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('grep -c "DEBUG-" /home/ubuntu/omnivoice/src/app/page.tsx')
print("DEBUG:", stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('wc -l /home/ubuntu/omnivoice/src/app/page.tsx')
print("Lines:", stdout.read().decode().strip())

ssh.close()
