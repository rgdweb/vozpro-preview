#!/usr/bin/env python3
"""
Oracle VPS Audio Diagnostics Script
SSH into 147.15.77.137 (ubuntu) and check audio file permissions,
directory structure, .htaccess files, web server config, and local access.
READ-ONLY — does not modify anything on the server.
"""

import paramiko
import sys
import os

# ── Configuration ─────────────────────────────────────────────────────────────
HOST = "147.15.77.137"
USER = "ubuntu"
PORT = 22
SSH_KEY_PATHS = [
    os.path.expanduser("~/.ssh/id_rsa"),
    os.path.expanduser("~/.ssh/id_ed25519"),
    os.path.expanduser("~/.ssh/id_ecdsa"),
    "/home/z/.ssh/id_rsa",
]
TIMEOUT = 15  # seconds per command

# ── Commands to run (READ-ONLY) ──────────────────────────────────────────────
COMMANDS = [
    ("1. Audio files in /var/www/omnivoce/audios/ref/ (permissions check)",
     "ls -la /var/www/omnivoce/audios/ref/ | head -20"),

    ("2. Parent directory /var/www/omnivoce/audios/ permissions",
     "ls -la /var/www/omnivoce/audios/"),

    ("3. Root .htaccess (/var/www/omnivoce/.htaccess)",
     "cat /var/www/omnivoce/.htaccess"),

    ("4. Audios .htaccess (/var/www/omnivoce/audios/.htaccess)",
     "cat /var/www/omnivoce/audios/.htaccess"),

    ("5a. Apache config (if exists)",
     "cat /etc/apache2/sites-enabled/omnivoce.conf 2>/dev/null || echo 'Apache config not found'"),

    ("5b. Nginx config (if exists)",
     "cat /etc/nginx/sites-enabled/default 2>/dev/null || echo 'Nginx default config not found'"),

    ("6. Local HTTP access test to audio file",
     "curl -sI http://localhost/audios/ref/6a12748a2897a_1779594378.mp3"),

    ("7. File stat for specific audio file",
     "stat /var/www/omnivoce/audios/ref/6a12748a2897a_1779594378.mp3"),

    ("8. Extra: count files in audios/ref/",
     "ls /var/www/omnivoce/audios/ref/ | wc -l"),

    ("9. Extra: check www-data user and groups",
     "id www-data 2>/dev/null || echo 'www-data user not found'"),

    ("10. Extra: check running web server",
     "ps aux | grep -E 'apache|nginx' | grep -v grep"),
]


def find_ssh_key():
    """Search for an available SSH private key."""
    for path in SSH_KEY_PATHS:
        if os.path.isfile(path):
            print(f"[INFO] Found SSH key: {path}")
            return path
    return None


def create_ssh_client(host, port, username, key_path):
    """Create and return a connected SSHClient."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if key_path:
            print(f"[INFO] Connecting to {host}:{port} as {username} with key {key_path}...")
            key = paramiko.RSAKey.from_private_key_file(key_path)
            client.connect(host, port=port, username=username, pkey=key,
                           timeout=TIMEOUT, allow_agent=False, look_for_keys=False)
        else:
            # Try with ssh-agent or default keys
            print(f"[INFO] Connecting to {host}:{port} as {username} (agent/default keys)...")
            client.connect(host, port=port, username=username, timeout=TIMEOUT)
        print(f"[OK] Connected successfully to {host}")
        return client
    except paramiko.AuthenticationException:
        print(f"[FAIL] Authentication failed for {username}@{host}")
        return None
    except paramiko.SSHException as e:
        print(f"[FAIL] SSH error: {e}")
        return None
    except Exception as e:
        print(f"[FAIL] Connection error: {type(e).__name__}: {e}")
        return None


def run_command(client, label, command, timeout=TIMEOUT):
    """Execute a command over SSH and return stdout, stderr, exit code."""
    separator = "=" * 80
    print(f"\n{separator}")
    print(f"  {label}")
    print(f"  CMD: {command}")
    print(f"{separator}")

    try:
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()

        if out:
            print(out)
        if err:
            print(f"[STDERR] {err}")
        print(f"[EXIT CODE] {exit_code}")
        return out, err, exit_code
    except Exception as e:
        print(f"[ERROR] Failed to execute command: {e}")
        return "", str(e), -1


def main():
    print("=" * 80)
    print("  ORACLE VPS AUDIO DIAGNOSTICS")
    print(f"  Target: {USER}@{HOST}:{PORT}")
    print("=" * 80)

    # Step 1: Find SSH key
    print("\n[STEP 1] Checking for SSH keys...")
    key_path = find_ssh_key()
    if not key_path:
        print("[WARN] No SSH key found in standard locations:")
        for p in SSH_KEY_PATHS:
            print(f"       - {p}  (not found)")
        print("[INFO] Will attempt connection with SSH agent / default key lookup...")

    # Step 2: Connect
    print(f"\n[STEP 2] Connecting to {HOST}...")
    client = create_ssh_client(HOST, PORT, USER, key_path)
    if client is None:
        print("\n" + "=" * 80)
        print("  CONNECTION FAILED")
        print("=" * 80)
        print("\nPossible causes:")
        print("  1. No SSH key found on this system")
        print("  2. SSH key not authorized on the Oracle VPS")
        print("  3. Network/firewall blocking port 22")
        print("  4. Wrong hostname or credentials")
        print("\nTo fix this:")
        print("  - Copy your SSH private key to ~/.ssh/id_rsa")
        print("  - Or add this machine's public key to the server's authorized_keys")
        print("  - Or provide a password (not implemented in this script)")
        sys.exit(1)

    # Step 3: Run all commands
    print(f"\n[STEP 3] Running diagnostic commands ({len(COMMANDS)} commands)...\n")
    results = []
    for label, cmd in COMMANDS:
        out, err, code = run_command(client, label, cmd)
        results.append((label, cmd, out, err, code))

    # Step 4: Summary
    print("\n\n" + "=" * 80)
    print("  SUMMARY OF FINDINGS")
    print("=" * 80)
    for label, cmd, out, err, code in results:
        status = "OK" if code == 0 else "ISSUE"
        print(f"\n  [{status}] {label}")
        if code != 0:
            print(f"         Exit code: {code}")
            if err:
                print(f"         Error: {err[:200]}")

    # Cleanup
    client.close()
    print(f"\n[INFO] Connection closed.")


if __name__ == "__main__":
    main()
