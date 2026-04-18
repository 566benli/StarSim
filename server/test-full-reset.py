#!/usr/bin/env python3
"""Full end-to-end test of password reset flow."""
import paramiko, sys, time, json, re

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print('Connecting to VPS...')
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

def run(cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8', errors='replace').strip()

# Step 1: Create a fresh test user with email
print('=' * 60)
print('FULL END-TO-END PASSWORD RESET TEST')
print('=' * 60)

print('\n[1] Creating test user "ResetTester" with email...')
result = run(
    "curl -s -X POST http://localhost:3777/api/auth/register "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"ResetTester\",\"password\":\"OldPass123\",\"email\":\"li7917016@gmail.com\"}'"
)
try:
    data = json.loads(result)
    if 'user' in data:
        print(f'  Created user: {data["user"]["username"]} (id: {data["user"]["id"]})')
    elif 'error' in data:
        print(f'  {data["error"]} (may already exist, continuing...)')
except:
    print(f'  Response: {result[:200]}')

# Step 2: Verify login works with old password
print('\n[2] Verifying login with OLD password (OldPass123)...')
result = run(
    "curl -s -X POST http://localhost:3777/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"username\":\"ResetTester\",\"password\":\"OldPass123\"}'"
)
try:
    data = json.loads(result)
    if 'token' in data:
        print('  Login with old password: SUCCESS')
    else:
        print(f'  Login result: {data}')
except:
    print(f'  Response: {result[:200]}')

# Step 3: Clear error log before test
run('> /opt/genesis-error-terminal/logs/error-0.log')

# Step 4: Trigger forgot password
print('\n[3] Triggering password reset for li7917016@gmail.com...')
result = run(
    "curl -s -X POST http://localhost:3777/api/auth/forgot "
    "-H 'Content-Type: application/json' "
    "-d '{\"email\":\"li7917016@gmail.com\"}'"
)
print(f'  API response: {result}')

# Wait for email to be sent
print('  Waiting 5s for email delivery...')
time.sleep(5)

# Step 5: Check for errors
errors = run('cat /opt/genesis-error-terminal/logs/error-0.log')
if errors:
    print(f'\n  EMAIL ERROR: {errors[:300]}')
    print('\n  TEST FAILED - email sending had errors')
else:
    print('  No SMTP errors!')

# Step 6: Get the reset token from database
print('\n[4] Retrieving reset token from database...')
token_result = run(
    "cd /opt/genesis-error-terminal && node -e \""
    "const db = require('./database');"
    "(async()=>{await db.init();"
    "const row = db.one('SELECT token, expires_at FROM reset_tokens WHERE used=0 ORDER BY id DESC LIMIT 1');"
    "console.log(JSON.stringify(row));"
    "})();\""
)
try:
    token_data = json.loads(token_result)
    reset_token = token_data['token']
    print(f'  Token: {reset_token[:8]}...{reset_token[-8:]}')
    print(f'  Expires: {token_data["expires_at"]}')
    print(f'  Reset URL: https://genesis-error-terminal.duckdns.org/reset?token={reset_token}')
except:
    print(f'  Raw: {token_result[:300]}')
    reset_token = None

# Step 7: Use the token to reset the password
if reset_token:
    print('\n[5] Using token to reset password to "NewPass456"...')
    result = run(
        f"curl -s -X POST http://localhost:3777/api/auth/reset "
        f"-H 'Content-Type: application/json' "
        f"-d '{{\"token\":\"{reset_token}\",\"newPassword\":\"NewPass456\"}}'"
    )
    print(f'  API response: {result}')

    # Step 8: Verify NEW password works
    print('\n[6] Testing login with NEW password (NewPass456)...')
    result = run(
        "curl -s -X POST http://localhost:3777/api/auth/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"username\":\"ResetTester\",\"password\":\"NewPass456\"}'"
    )
    try:
        data = json.loads(result)
        if 'token' in data:
            print('  Login with new password: SUCCESS')
        else:
            print(f'  FAILED: {data}')
    except:
        print(f'  Response: {result[:200]}')

    # Step 9: Verify OLD password no longer works
    print('\n[7] Verifying OLD password (OldPass123) is rejected...')
    result = run(
        "curl -s -X POST http://localhost:3777/api/auth/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"username\":\"ResetTester\",\"password\":\"OldPass123\"}'"
    )
    try:
        data = json.loads(result)
        if 'error' in data:
            print(f'  Old password rejected: SUCCESS ({data["error"]})')
        else:
            print('  WARNING: Old password still works!')
    except:
        print(f'  Response: {result[:200]}')

    # Step 10: Verify token is now used (can't reuse)
    print('\n[8] Verifying token can\'t be reused...')
    result = run(
        f"curl -s -X POST http://localhost:3777/api/auth/reset "
        f"-H 'Content-Type: application/json' "
        f"-d '{{\"token\":\"{reset_token}\",\"newPassword\":\"HackerPass\"}}'"
    )
    try:
        data = json.loads(result)
        if 'error' in data:
            print(f'  Token reuse blocked: SUCCESS ({data["error"]})')
        else:
            print('  WARNING: Token was reused!')
    except:
        print(f'  Response: {result[:200]}')

print('\n' + '=' * 60)
print('TEST COMPLETE')
print('=' * 60)

ssh.close()
