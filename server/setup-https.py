#!/usr/bin/env python3
"""Set up HTTPS with Certbot on VPS for starsim-terminal.duckdns.org."""
import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DOMAIN = 'starsim-terminal.duckdns.org'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to VPS...')
ssh.connect('66.42.51.85', username='root', password=r'H{z4@WW-#7LQPgP}', timeout=15)
print('Connected!\n')

def run(cmd, label=None, timeout=120):
    if label:
        print(label)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        for line in out.split('\n')[-8:]:
            print(f'  {line}')
    if exit_code != 0 and err:
        for line in err.split('\n')[-3:]:
            print(f'  [err] {line}')
    return exit_code, out

# Step 1: Update nginx config with the domain name
print(f'[1/5] Updating nginx config for {DOMAIN}...')
nginx_conf = f"""server {{
    listen 80;
    listen [::]:80;
    server_name {DOMAIN};

    location / {{
        proxy_pass http://127.0.0.1:3777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        client_max_body_size 10M;
    }}
}}"""

sftp = ssh.open_sftp()
with sftp.file('/etc/nginx/sites-available/starsim', 'w') as f:
    f.write(nginx_conf)
sftp.close()

run('nginx -t 2>&1 && systemctl reload nginx && echo OK', '  Testing & reloading nginx:')

# Step 2: Install Certbot
print(f'\n[2/5] Installing Certbot...')
run('export DEBIAN_FRONTEND=noninteractive && apt-get install -y -qq certbot python3-certbot-nginx', timeout=120)

# Step 3: Obtain SSL certificate
print(f'\n[3/5] Obtaining SSL certificate for {DOMAIN}...')
certbot_cmd = (
    f'certbot --nginx -d {DOMAIN} '
    f'--non-interactive --agree-tos '
    f'--email li7917016@gmail.com '
    f'--redirect'
)
code, out = run(certbot_cmd, timeout=120)
if code != 0:
    print('  Certbot may have had issues, checking status...')
    run(f'certbot certificates 2>&1')

# Step 4: Verify nginx config after certbot
print(f'\n[4/5] Verifying final nginx config...')
run('nginx -t 2>&1')
run('cat /etc/nginx/sites-available/starsim | head -30')

# Step 5: Update server .env with HTTPS URL
print(f'\n[5/5] Updating APP_URL to HTTPS...')
run(
    f"sed -i 's|APP_URL=http://66.42.51.85|APP_URL=https://{DOMAIN}|' /opt/starsim-terminal/.env",
    '  Updating .env:'
)
run('grep APP_URL /opt/starsim-terminal/.env')

# Restart server with new APP_URL
run('cd /opt/starsim-terminal && pm2 restart starsim-terminal', '  Restarting server:')
time.sleep(3)

# Final verification
print(f'\n=== Verification ===')
run(f'curl -s -o /dev/null -w "%{{http_code}}" https://{DOMAIN}/api/health', f'  HTTPS status code:')
run(f'curl -s https://{DOMAIN}/api/health', f'  HTTPS response:')

ssh.close()
print(f'\nDone! Your Central Terminal is now at: https://{DOMAIN}')
