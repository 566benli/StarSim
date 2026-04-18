#!/usr/bin/env python3
"""Deploy updated server files to VPS and restart."""
import paramiko, sys, time, os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

VPS_IP = '66.42.51.85'
VPS_PASS = r'H{z4@WW-#7LQPgP}'
LOCAL_SERVER = r'c:\Users\Administrator\Desktop\StarSim\server'
REMOTE_DIR = '/opt/genesis-error-terminal'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to {VPS_IP}...')
ssh.connect(VPS_IP, username='root', password=VPS_PASS, timeout=15)
print('Connected!\n')

sftp = ssh.open_sftp()

# Files to upload
files_to_upload = [
    'server.js',
    'database.js',
    'public/index.html',
    'public/terminal.html',
]

print('[1] Uploading updated files...')
for f in files_to_upload:
    local_path = os.path.join(LOCAL_SERVER, f)
    remote_path = f'{REMOTE_DIR}/{f}'
    # Ensure remote dir exists
    rdir = os.path.dirname(remote_path)
    try:
        sftp.stat(rdir)
    except FileNotFoundError:
        sftp.mkdir(rdir)
    sftp.put(local_path, remote_path)
    print(f'  Uploaded: {f}')

sftp.close()

# Fix line endings
print('\n[2] Fixing line endings...')
stdin, stdout, stderr = ssh.exec_command(
    f"cd {REMOTE_DIR} && sed -i 's/\\r$//' server.js database.js public/index.html public/terminal.html"
)
stdout.channel.recv_exit_status()
print('  Done')

# Update .env to add ADMIN_USERS for existing test users
print('\n[3] Adding ADMIN_USERS to .env...')
stdin, stdout, stderr = ssh.exec_command(
    f"cd {REMOTE_DIR} && grep -q ADMIN_USERS .env && echo EXISTS || echo 'ADMIN_USERS=SmtpTester,TestExplorer' >> .env && echo ADDED"
)
stdout.channel.recv_exit_status()
out = stdout.read().decode().strip()
print(f'  {out}')

# Restart server
print('\n[4] Restarting server...')
stdin, stdout, stderr = ssh.exec_command(f'cd {REMOTE_DIR} && pm2 restart genesis-error-terminal')
stdout.channel.recv_exit_status()
for line in stdout.read().decode().strip().split('\n')[-5:]:
    print(f'  {line}')

time.sleep(3)

# Verify health
print('\n[5] Health check...')
stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3777/api/health')
stdout.channel.recv_exit_status()
print(f'  {stdout.read().decode().strip()}')

# Check errors
stdin, stdout, stderr = ssh.exec_command(f'tail -5 {REMOTE_DIR}/logs/error-0.log')
stdout.channel.recv_exit_status()
err = stdout.read().decode().strip()
if err:
    print(f'\n  Errors: {err[:300]}')
else:
    print('  No errors!')

# Verify both pages
print('\n[6] Checking pages...')
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3777/')
stdout.channel.recv_exit_status()
print(f'  / (user dashboard): {stdout.read().decode().strip()}')

stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:3777/terminal')
stdout.channel.recv_exit_status()
print(f'  /terminal (operator): {stdout.read().decode().strip()}')

# Verify admin API requires auth
stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:3777/api/admin/users')
stdout.channel.recv_exit_status()
print(f'  /api/admin/users (no auth): {stdout.read().decode().strip()}')

ssh.close()
print('\nDeployment complete!')
