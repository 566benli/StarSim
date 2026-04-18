#!/usr/bin/env python3
"""Test SMTP email delivery for password reset."""
import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print('Connecting to VPS...')
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

def run(cmd, label=None):
    if label:
        print(f'{label}')
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f'  {out[:500]}')
    if exit_code != 0 and err:
        print(f'  [err] {err[:300]}')
    return out

# Step 1: Register test user with email
print('[1] Registering test user with email...')
run(
    "curl -s -X POST http://localhost:3777/api/auth/register "
    "-H 'Content-Type: application/json' "
    '-d \'{"username":"SmtpTester","password":"Test1234!","email":"li7917016@gmail.com"}\''
)

# Step 2: Trigger forgot password
print('\n[2] Triggering password reset...')
run(
    "curl -s -X POST http://localhost:3777/api/auth/forgot "
    "-H 'Content-Type: application/json' "
    '-d \'{"email":"li7917016@gmail.com"}\''
)

# Step 3: Wait and check logs
print('\n[3] Waiting 5s for email delivery...')
time.sleep(5)

print('\n[4] Server logs:')
run('pm2 logs genesis-error-terminal --lines 25 --nostream 2>&1')

ssh.close()
print('\n\nDone! Check your inbox at li7917016@gmail.com for the reset email.')
