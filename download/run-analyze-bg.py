#!/usr/bin/env python3
"""Run analyze script in background on Oracle, then fetch output."""
import paramiko
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

def run(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("Connected!")

    # 1. Check if script exists
    out, _ = run(client, "ls -la /home/ubuntu/omnivoice/scripts/analyze-all-voices.js")
    print(f"Script: {out}")

    # 2. Check how many voice files exist
    out, _ = run(client, "ls /var/www/omnivoice/audios/ref/ 2>/dev/null | wc -l")
    print(f"Audio files in /var/www/omnivoice/audios/ref/: {out}")

    # 3. Run in background, redirect output to file
    print("\nStarting script in background...")
    run(client, "cd /home/ubuntu/omnivoice && nohup sudo node scripts/analyze-all-voices.js > /tmp/voice-analysis-output.txt 2>&1 &")
    
    # 4. Wait and check progress
    for i in range(12):  # max 60 seconds
        time.sleep(5)
        out, _ = run(client, "cat /tmp/voice-analysis-output.txt 2>/dev/null")
        if out:
            lines = out.count('\n')
            print(f"\n--- Output so far ({lines} lines, {i*5}s) ---")
            print(out[-3000:] if len(out) > 3000 else out)
            
            # Check if process finished
            out_ps, _ = run(client, "ps aux | grep 'analyze-all' | grep -v grep")
            if not out_ps:
                print("\n--- Process finished! ---")
                break
    
    # 5. Final output
    time.sleep(2)
    out, _ = run(client, "cat /tmp/voice-analysis-output.txt 2>/dev/null")
    print("\n=== FINAL OUTPUT ===")
    print(out)
    
    client.close()

if __name__ == '__main__':
    main()
