#!/usr/bin/env python3
"""Set li7917016@gmail.com as the only admin, remove admin from all others."""
import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8', errors='replace').strip()

# Step 1: Remove admin from everyone
print('[1] Removing admin from all users...')
run("cd /opt/genesis-error-terminal && node -e \"const db=require('./database');(async()=>{await db.init();db.run('UPDATE users SET is_admin=0');console.log('done')})()\"")

# Step 2: Set admin for the user with email li7917016@gmail.com
print('[2] Promoting li7917016@gmail.com to admin...')
run("cd /opt/genesis-error-terminal && node -e \"const db=require('./database');(async()=>{await db.init();db.run('UPDATE users SET is_admin=1 WHERE email=?',['li7917016@gmail.com']);console.log('done')})()\"")

# Step 3: Update .env so ADMIN_USERS only has SmtpTester (the account with that email)
print('[3] Updating ADMIN_USERS in .env...')
run("cd /opt/genesis-error-terminal && sed -i '/^ADMIN_USERS/d' .env && echo 'ADMIN_USERS=SmtpTester' >> .env")

# Step 4: Restart server
print('[4] Restarting server...')
out = run('cd /opt/genesis-error-terminal && pm2 restart genesis-error-terminal')
for line in out.split('\n')[-5:]:
    print(f'  {line}')

time.sleep(3)

# Step 5: Verify
print('\n[5] Verifying user roles:')
result = run("cd /opt/genesis-error-terminal && node -e \"const db=require('./database');(async()=>{await db.init();const rows=db.all('SELECT id,username,email,is_admin FROM users');console.log(JSON.stringify(rows))})()\"")
import json
users = json.loads(result)
for u in users:
    role = 'ADMIN' if u['is_admin'] else 'user'
    print(f"  {u['username']:20s} {u['email'] or '(no email)':30s} {role}")

print('\nHealth:', run('curl -s http://localhost:3777/api/health'))
ssh.close()
print('\nDone!')
