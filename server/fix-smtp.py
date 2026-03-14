#!/usr/bin/env python3
"""Fix SMTP password and retest."""
import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print('Connecting to VPS...')
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

# Try with spaces in the app password
env_content = (
    "# StarSim Central Terminal - Production Environment\n"
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
    "SMTP_PASS=fico itxc zchl jrsy\n"
    'SMTP_FROM="StarSim Terminal" <li7917016@gmail.com>\n'
    "\n"
    "APP_URL=http://66.42.51.85\n"
)

sftp = ssh.open_sftp()
with sftp.file('/opt/starsim-terminal/.env', 'w') as f:
    f.write(env_content)
sftp.close()
print('[1] Updated .env with spaces in App Password')

# Clear error log
ssh.exec_command('> /opt/starsim-terminal/logs/error-0.log')
time.sleep(1)

# Restart
print('[2] Restarting server...')
stdin, stdout, stderr = ssh.exec_command('cd /opt/starsim-terminal && pm2 restart starsim-terminal')
stdout.channel.recv_exit_status()
print('  Restarted')
time.sleep(3)

# Trigger forgot password again
print('[3] Triggering password reset email...')
stdin, stdout, stderr = ssh.exec_command(
    "curl -s -X POST http://localhost:3777/api/auth/forgot "
    "-H 'Content-Type: application/json' "
    "-d '{\"email\":\"li7917016@gmail.com\"}'"
)
stdout.channel.recv_exit_status()
print('  ' + stdout.read().decode('utf-8', errors='replace').strip())

time.sleep(5)

# Check error log
print('\n[4] Error log:')
stdin, stdout, stderr = ssh.exec_command('cat /opt/starsim-terminal/logs/error-0.log')
stdout.channel.recv_exit_status()
err = stdout.read().decode('utf-8', errors='replace').strip()
if err:
    for line in err.split('\n')[:5]:
        print('  ' + line)
else:
    print('  (no errors!)')

# Check output log
print('\n[5] Output log (last 10 lines):')
stdin, stdout, stderr = ssh.exec_command('tail -10 /opt/starsim-terminal/logs/output-0.log')
stdout.channel.recv_exit_status()
print(stdout.read().decode('utf-8', errors='replace').strip())

ssh.close()
print('\nDone!')
