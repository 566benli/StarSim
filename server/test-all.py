#!/usr/bin/env python3
"""Comprehensive test of all Genesis Error Central Terminal functions."""
import paramiko, sys, time, json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

passed = 0
failed = 0

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8', errors='replace').strip()

def api(method, endpoint, body=None, token=None):
    headers = "-H 'Content-Type: application/json'"
    if token:
        headers += f" -H 'Authorization: Bearer {token}'"
    data = f"-d '{json.dumps(body)}'" if body else ''
    cmd = f"curl -s -X {method} http://localhost:3777/api{endpoint} {headers} {data}"
    result = run(cmd)
    try:
        return json.loads(result)
    except:
        return {'_raw': result}

def check(name, condition, detail=''):
    global passed, failed
    if condition:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        print(f'  FAIL  {name} {detail}')

print('=' * 65)
print('  STARSIM CENTRAL TERMINAL �?COMPREHENSIVE TEST')
print('=' * 65)

# ─────────────────────────────────────────────────────────────
print('\n--- 1. HEALTH CHECK ---')
r = api('GET', '/health')
check('Server is running', r.get('status') == 'ok', str(r))

# ─────────────────────────────────────────────────────────────
print('\n--- 2. USER REGISTRATION ---')
r = api('POST', '/auth/register', {'username': 'NormalUser1', 'password': 'Pass1234', 'email': 'normal1@test.com'})
check('Register new user', 'token' in r, str(r.get('error', '')))
normal_token = r.get('token')
normal_user = r.get('user', {})

r2 = api('POST', '/auth/register', {'username': 'NormalUser1', 'password': 'Pass1234'})
check('Duplicate username rejected', r2.get('error') == 'Username already taken', str(r2))

r3 = api('POST', '/auth/register', {'username': '', 'password': 'Pass1234'})
check('Empty username rejected', 'error' in r3, str(r3))

r4 = api('POST', '/auth/register', {'username': 'ShortPw', 'password': '12'})
check('Short password rejected', 'error' in r4, str(r4))

# ─────────────────────────────────────────────────────────────
print('\n--- 3. USER LOGIN ---')
r = api('POST', '/auth/login', {'username': 'NormalUser1', 'password': 'Pass1234'})
check('Login with correct password', 'token' in r, str(r.get('error', '')))
normal_token = r.get('token', normal_token)

r = api('POST', '/auth/login', {'username': 'NormalUser1', 'password': 'WrongPass'})
check('Wrong password rejected', r.get('error') == 'Invalid credentials')

r = api('POST', '/auth/login', {'username': 'normal1@test.com', 'password': 'Pass1234'})
check('Login with email as username', 'token' in r, str(r.get('error', '')))

# ─────────────────────────────────────────────────────────────
print('\n--- 4. SESSION / ME ENDPOINT ---')
r = api('GET', '/auth/me', token=normal_token)
check('/me returns user data', r.get('user', {}).get('username') == 'NormalUser1')
check('Normal user is NOT admin', r.get('user', {}).get('isAdmin') == False, str(r.get('user', {}).get('isAdmin')))

r = api('GET', '/auth/me')
check('/me without token returns 401', r.get('error') == 'No token')

# ─────────────────────────────────────────────────────────────
print('\n--- 5. ADMIN LOGIN (SmtpTester) ---')
r = api('POST', '/auth/login', {'username': 'SmtpTester', 'password': 'NewPass456'})
check('Admin login succeeds', 'token' in r, str(r.get('error', '')))
admin_token = r.get('token')
check('Admin user has isAdmin=true', r.get('user', {}).get('isAdmin') == True, str(r.get('user', {})))

# ─────────────────────────────────────────────────────────────
print('\n--- 6. CLOUD SAVES (normal user) ---')
r = api('POST', '/saves', {'slotName': 'TestUniverse1', 'simData': '{"test":true}', 'bodyCount': 5, 'simTime': 100.5}, token=normal_token)
check('Create cloud save', 'id' in r, str(r))
save_id = r.get('id')

r = api('GET', '/saves', token=normal_token)
check('List own saves', len(r.get('saves', [])) >= 1, str(r))

r = api('GET', f'/saves/{save_id}', token=normal_token)
check('Load specific save', r.get('save') is not None, str(r))

r = api('POST', '/saves', {'slotName': 'TestUniverse1', 'simData': '{"test":true,"v2":1}', 'bodyCount': 8, 'simTime': 200}, token=normal_token)
check('Update existing save (same slot)', r.get('message') == 'Save updated', str(r))

r = api('GET', '/saves', token=None)
check('Saves without auth returns 401', r.get('error') == 'No token')

# ─────────────────────────────────────────────────────────────
print('\n--- 7. USER DASHBOARD STATS (personal) ---')
r = api('GET', '/terminal/my-stats', token=normal_token)
check('My stats returns personal data', r.get('saveCount', 0) >= 1, str(r))
check('My stats shows correct body count', r.get('totalBodies', 0) >= 5)

# ─────────────────────────────────────────────────────────────
print('\n--- 8. PUBLIC STATS (leaderboard, global) ---')
r = api('GET', '/terminal/stats')
check('Public stats accessible without auth', 'userCount' in r, str(r))
check('User count > 0', r.get('userCount', 0) > 0)
check('Has topCreators', isinstance(r.get('topCreators'), list))

# ─────────────────────────────────────────────────────────────
print('\n--- 9. ADMIN API �?ACCESS CONTROL ---')
r = api('GET', '/admin/users', token=normal_token)
check('Normal user BLOCKED from admin/users', r.get('error') == 'Admin access required', str(r))

r = api('GET', '/admin/saves', token=normal_token)
check('Normal user BLOCKED from admin/saves', r.get('error') == 'Admin access required', str(r))

r = api('GET', '/admin/users')
check('Unauthenticated BLOCKED from admin/users', r.get('error') == 'No token')

# ─────────────────────────────────────────────────────────────
print('\n--- 10. ADMIN API �?FULL ACCESS ---')
r = api('GET', '/admin/users', token=admin_token)
check('Admin can list all users', isinstance(r.get('users'), list) and len(r['users']) > 0, str(r.get('error', '')))
all_users = r.get('users', [])
user_names = [u['username'] for u in all_users]
check('All users visible to admin', 'NormalUser1' in user_names and 'SmtpTester' in user_names, str(user_names))

r = api('GET', '/admin/saves', token=admin_token)
check('Admin can list all saves', isinstance(r.get('saves'), list), str(r.get('error', '')))

# ─────────────────────────────────────────────────────────────
print('\n--- 11. ADMIN �?PROMOTE / DEMOTE ---')
normal_id = normal_user.get('id')
if normal_id:
    r = api('PUT', f'/admin/users/{normal_id}/promote', token=admin_token)
    check('Admin can promote user', r.get('message') == 'User promoted to admin', str(r))

    r2 = api('GET', '/admin/users', token=admin_token)
    promoted = [u for u in r2.get('users', []) if u['username'] == 'NormalUser1']
    check('User is now admin', promoted and promoted[0].get('is_admin') == 1, str(promoted))

    r = api('PUT', f'/admin/users/{normal_id}/demote', token=admin_token)
    check('Admin can demote user', r.get('message') == 'Admin privileges removed', str(r))

    r2 = api('GET', '/admin/users', token=admin_token)
    demoted = [u for u in r2.get('users', []) if u['username'] == 'NormalUser1']
    check('User is now regular again', demoted and demoted[0].get('is_admin') == 0, str(demoted))

# ─────────────────────────────────────────────────────────────
print('\n--- 12. ADMIN �?SELF-PROTECTION ---')
admin_me = api('GET', '/auth/me', token=admin_token)
admin_id = admin_me.get('user', {}).get('id')
if admin_id:
    r = api('DELETE', f'/admin/users/{admin_id}', token=admin_token)
    check('Admin cannot delete self', r.get('error') == 'Cannot delete yourself', str(r))

    r = api('PUT', f'/admin/users/{admin_id}/demote', token=admin_token)
    check('Admin cannot demote self', r.get('error') == 'Cannot demote yourself', str(r))

# ─────────────────────────────────────────────────────────────
print('\n--- 13. PASSWORD RESET FLOW ---')
# Clear error log
run('> /opt/genesis-error-terminal/logs/error-0.log')

r = api('POST', '/auth/forgot', {'email': 'normal1@test.com'})
check('Forgot password accepted', 'message' in r, str(r))

time.sleep(4)
errors = run('cat /opt/genesis-error-terminal/logs/error-0.log')
check('No SMTP errors', len(errors.strip()) == 0, errors[:100] if errors else '')

# Get reset token
tok_result = run(
    "cd /opt/genesis-error-terminal && node -e \""
    "const db=require('./database');"
    "(async()=>{await db.init();"
    "const r=db.one('SELECT token FROM reset_tokens WHERE used=0 ORDER BY id DESC LIMIT 1');"
    "console.log(r?r.token:'NONE');"
    "})();\""
)
if tok_result and tok_result != 'NONE':
    r = api('POST', '/auth/reset', {'token': tok_result, 'newPassword': 'NewNormalPass'})
    check('Reset password with token', r.get('message') == 'Password reset successfully', str(r))

    r = api('POST', '/auth/login', {'username': 'NormalUser1', 'password': 'NewNormalPass'})
    check('Login with new password', 'token' in r, str(r.get('error', '')))
    normal_token = r.get('token', normal_token)

    r = api('POST', '/auth/login', {'username': 'NormalUser1', 'password': 'Pass1234'})
    check('Old password rejected', 'error' in r)

    r = api('POST', '/auth/reset', {'token': tok_result, 'newPassword': 'HackerPass'})
    check('Token cannot be reused', 'error' in r, str(r))
else:
    check('Reset token retrieved', False, tok_result)

# ─────────────────────────────────────────────────────────────
print('\n--- 14. DELETE SAVE ---')
r = api('GET', '/saves', token=normal_token)
saves = r.get('saves', [])
if saves:
    del_id = saves[0]['id']
    r = api('DELETE', f'/saves/{del_id}', token=normal_token)
    check('Delete own save', r.get('message') == 'Save deleted', str(r))

# ─────────────────────────────────────────────────────────────
print('\n--- 15. PAGE RESPONSES ---')
code = run("curl -s -o /dev/null -w '%{http_code}' http://localhost:3777/")
check('/ returns 200', code == '200', code)

code = run("curl -s -o /dev/null -w '%{http_code}' http://localhost:3777/terminal")
check('/terminal returns 200', code == '200', code)

code = run("curl -s -o /dev/null -w '%{http_code}' http://localhost:3777/reset?token=test")
check('/reset returns 200', code == '200', code)

title_user = run("curl -s http://localhost:3777/ | grep -o '<title>[^<]*</title>'")
check('/ title is "My Dashboard"', 'My Dashboard' in title_user, title_user)

title_term = run("curl -s http://localhost:3777/terminal | grep -o '<title>[^<]*</title>'")
check('/terminal title is "Central Terminal"', 'Central Terminal' in title_term, title_term)

# ─────────────────────────────────────────────────────────────
print('\n--- 16. HTTPS ---')
code = run("curl -s -o /dev/null -w '%{http_code}' https://genesis-error-terminal.duckdns.org/api/health")
check('HTTPS health returns 200', code == '200', code)

code = run("curl -s -o /dev/null -w '%{http_code}' http://genesis-error-terminal.duckdns.org/api/health")
check('HTTP redirects (301)', code == '301', code)

# ─────────────────────────────────────────────────────────────
# Cleanup: delete test user
print('\n--- 17. CLEANUP ---')
if normal_id:
    r = api('DELETE', f'/admin/users/{normal_id}', token=admin_token)
    check('Deleted test user NormalUser1', r.get('message') == 'User deleted', str(r))

# FINAL
print('\n' + '=' * 65)
print(f'  RESULTS: {passed} passed, {failed} failed, {passed+failed} total')
print('=' * 65)

ssh.close()
