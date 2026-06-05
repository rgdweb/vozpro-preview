import paramiko

key = paramiko.RSAKey.from_private_key_file('/home/z/.ssh/oracle_key')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('147.15.77.137', username='ubuntu', pkey=key, timeout=10)

# Check title and handleGenerate validation
stdin, stdout, stderr = ssh.exec_command('sed -n "3144,3150p" /home/ubuntu/omnivoice/src/app/page.tsx')
print("=== Button title ===")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command('grep -n "selectedSpeakerId" /home/ubuntu/omnivoice/src/app/page.tsx | head -15')
print("=== selectedSpeakerId refs ===")
print(stdout.read().decode())

ssh.close()
