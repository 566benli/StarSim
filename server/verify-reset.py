#!/usr/bin/env python3
"""Verify password reset worked for the correct user."""
import paramiko, sys, json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8', errors='replace').strip()

# Check all users
print('All users in database:')
r = run(
    'cd /opt/starsim-terminal && node -e "'
    "const db = require('./database');"
    "(async()=>{await db.init();"
    "const rows = db.all('SELECT id,username,email FROM users');"
    'console.log(JSON.stringify(rows,null,2));'
    '})();"'
)
print(r)

# Login as SmtpTester with NEW password
print('\n--- Test: SmtpTester + NewPass456 ---')
r = run(
    "curl -s -X POST http://localhost:3777/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"SmtpTester\",\"password\":\"NewPass456\"}'"
)
data = json.loads(r)
if 'token' in data:
    print(f'  SUCCESS - logged in as {data["user"]["username"]}')
else:
    print(f'  {data}')

# Login using email as username
print('\n--- Test: li7917016@gmail.com + NewPass456 ---')
r = run(
    "curl -s -X POST http://localhost:3777/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"li7917016@gmail.com\",\"password\":\"NewPass456\"}'"
)
data = json.loads(r)
if 'token' in data:
    print(f'  SUCCESS - logged in as {data["user"]["username"]}')
else:
    print(f'  {data}')

# Verify old password rejected
print('\n--- Test: SmtpTester + old password (Test1234!) ---')
r = run(
    "curl -s -X POST http://localhost:3777/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"SmtpTester\",\"password\":\"Test1234!\"}'"
)
data = json.loads(r)
if 'error' in data:
    print(f'  CORRECT - old password rejected: {data["error"]}')
else:
    print(f'  WARNING - old password still works!')

ssh.close()
print('\nDone!')
