"""
Genesis Error Central Terminal - Automated VPS Deployment
Uploads server files and runs deploy.sh via SSH (no interactive password needed).
"""
import paramiko
import os
import stat
import sys
import time

HOST = "66.42.51.85"
USER = "root"
PASS = r"H{z4@WW-#7LQPgP}"
REMOTE_DIR = "/opt/genesis-error-terminal"
LOCAL_DIR = r"C:\Users\Administrator\Desktop\genesis-error-server-deploy"

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def log(msg):
    print(f"  [{time.strftime('%H:%M:%S')}] {msg}")

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload a directory."""
    for item in os.listdir(local_path):
        local_item = os.path.join(local_path, item)
        remote_item = remote_path + "/" + item
        if os.path.isdir(local_item):
            try:
                sftp.mkdir(remote_item)
            except IOError:
                pass
            upload_dir(sftp, local_item, remote_item)
        else:
            size = os.path.getsize(local_item)
            log(f"  Uploading {item} ({size:,} bytes)")
            sftp.put(local_item, remote_item)

def run_cmd(ssh, cmd, stream=True):
    """Run a command and print output in real-time."""
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    output = ""
    for line in stdout:
        line = line.rstrip()
        if stream:
            print(f"    {line}")
        output += line + "\n"
    err = stderr.read().decode()
    if err.strip():
        print(f"    [stderr] {err.strip()}")
    return output

print()
print("  ======================================================")
print("  Genesis Error Central Terminal - Automated VPS Deployment")
print("  ======================================================")
print()

# Step 1: Connect
log(f"Connecting to {HOST}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
except Exception as e:
    log(f"CONNECTION FAILED: {e}")
    sys.exit(1)
log("Connected!")

# Step 2: Upload files
log("Creating remote directory...")
run_cmd(ssh, f"mkdir -p {REMOTE_DIR}/public {REMOTE_DIR}/data {REMOTE_DIR}/logs", stream=False)

log("Uploading server files...")
sftp = ssh.open_sftp()
upload_dir(sftp, LOCAL_DIR, REMOTE_DIR)
sftp.close()
log("All files uploaded!")

# Step 3: Fix line endings (Windows -> Unix) and run deployment
log("Fixing line endings for Linux...")
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/deploy.sh", stream=False)
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/server.js", stream=False)
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/database.js", stream=False)
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/ecosystem.config.js", stream=False)
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/package.json", stream=False)
run_cmd(ssh, f"sed -i 's/\\r$//' {REMOTE_DIR}/.env.production", stream=False)

log("Running deployment script (this takes 2-3 minutes)...")
print()
output = run_cmd(ssh, f"cd {REMOTE_DIR} && chmod +x deploy.sh && bash deploy.sh")
print()

# Step 4: Verify
log("Verifying server is running...")
time.sleep(3)
verify = run_cmd(ssh, "curl -s http://localhost:3777/api/health 2>/dev/null || echo FAIL", stream=False)
if "ok" in verify:
    log("SERVER IS LIVE!")
else:
    log("Server may still be starting. Check: pm2 logs genesis-error-terminal")

# Get public IP
ip = run_cmd(ssh, "curl -s ifconfig.me 2>/dev/null", stream=False).strip()

ssh.close()

print()
print("  ======================================================")
print(f"  DEPLOYMENT COMPLETE!")
print(f"  Dashboard:  http://{ip}")
print(f"  API:        http://{ip}/api")
print("  ======================================================")
print()
