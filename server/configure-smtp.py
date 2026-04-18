#!/usr/bin/env python3
"""Configure Gmail SMTP on VPS and restart server."""
import paramiko, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print('Connecting to VPS...')
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

env_content = (
    "# Genesis Error Central Terminal - Production Environment\n"
    "NODE_ENV=production\n"
    "PORT=3777\n"
    "\n"
    "JWT_SECRET=1e5ab58927fe95a9c0b37f547718aa954c9e860c52b45687009fed487efd36245074317c8245a810d9c9bb359848ffcd\n"
    "\n"
    "# Email (Gmail SMTP)\n"
    "SMTP_HOST=smtp.gmail.com\n"
    "SMTP_PORT=587\n"
    "SMTP_SECURE=false\n"
    "SMTP_USER=li7917016@gmail.com\n"
    "SMTP_PASS=ficoitxczhcljrsy\n"
    'SMTP_FROM="Genesis Error Terminal" <li7917016@gmail.com>\n'
    "\n"
    "APP_URL=http://66.42.51.85\n"
)

# Write .env
sftp = ssh.open_sftp()
with sftp.file('/opt/genesis-error-terminal/.env', 'w') as f:
    f.write(env_content)
sftp.close()
print('[1] .env written with SMTP config')

# Verify contents
_, so, _ = ssh.exec_command('cat /opt/genesis-error-terminal/.env')
print(so.read().decode())

# Restart PM2
print('[2] Restarting server...')
_, so, se = ssh.exec_command('cd /opt/genesis-error-terminal && pm2 restart genesis-error-terminal')
so.channel.recv_exit_status()
out = so.read().decode().strip()
for line in out.split('\n')[-5:]:
    print('  ' + line)

import time
time.sleep(3)

# Verify server is up
print('\n[3] Checking health...')
_, so, _ = ssh.exec_command('curl -s http://localhost:3777/api/health')
print('  ' + so.read().decode().strip())

# Check PM2 logs for SMTP readiness
print('\n[4] Recent logs:')
_, so, _ = ssh.exec_command('pm2 logs genesis-error-terminal --lines 10 --nostream 2>&1')
print(so.read().decode().strip())

ssh.close()
print('\nSMTP configuration complete!')
