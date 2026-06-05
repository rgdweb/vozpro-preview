import paramiko

key = paramiko.RSAKey.from_private_key_file('/home/z/.ssh/oracle_key')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('147.15.77.137', username='ubuntu', pkey=key, timeout=10)

# Download, fix title, upload
sftp = ssh.open_sftp()
sftp.get('/home/ubuntu/omnivoice/src/app/page.tsx', '/home/z/my-project/page_oracle.tsx')
sftp.close()

with open('/home/z/my-project/page_oracle.tsx', 'r') as f:
    lines = f.readlines()

# Fix title: add && !selectedSpeakerId to the condition
old_title = "              !selectedVariationId && !uploadedVoiceUrl && voiceMode === 'clone'\n"
new_title = "              !selectedVariationId && !uploadedVoiceUrl && !selectedSpeakerId && voiceMode === 'clone'\n"

found = False
for i, line in enumerate(lines):
    if old_title in line:
        lines[i] = new_title
        found = True
        print(f"Fixed title at line {i+1}")
        break

if not found:
    print("Title pattern not found!")
    for i in range(3143, 3150):
        print(f"  {i+1}: {repr(lines[i])}")

with open('/home/z/my-project/page_fixed.tsx', 'w') as f:
    f.writelines(lines)

sftp = ssh.open_sftp()
sftp.put('/home/z/my-project/page_fixed.tsx', '/tmp/page_fixed_remote.tsx')
sftp.close()

stdin, stdout, stderr = ssh.exec_command('sudo cp /tmp/page_fixed_remote.tsx /home/ubuntu/omnivoice/src/app/page.tsx && sudo chown ubuntu:ubuntu /home/ubuntu/omnivoice/src/app/page.tsx && echo OK')
print("Upload:", stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command('sed -n "3142,3152p" /home/ubuntu/omnivoice/src/app/page.tsx')
print("Verified:")
print(stdout.read().decode())

ssh.close()
