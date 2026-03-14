#!/usr/bin/env python3
"""Re-run the full VPS deployment for StarSim Central Terminal."""
import paramiko, sys, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

VPS_IP = '66.42.51.85'
VPS_PASS = r'H{z4@WW-#7LQPgP}'

def run(ssh, cmd, label=None, timeout=180):
    if label:
        print(f'  {label}')
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        for line in out.split('\n')[-5:]:
            print(f'    {line}')
    if exit_code != 0 and err:
        for line in err.split('\n')[-3:]:
            print(f'    [err] {line}')
    return exit_code, out

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f'Connecting to {VPS_IP}...')
ssh.connect(VPS_IP, username='root', password=VPS_PASS, timeout=15)
print('Connected!\n')

# Fix line endings
run(ssh, "cd /opt/starsim-terminal && sed -i 's/\\r$//' deploy.sh server.js database.js ecosystem.config.js package.json 2>/dev/null; sed -i 's/\\r$//' .env.production .env.example 2>/dev/null; echo OK", "Fixing CRLF line endings...")

# Step 1
run(ssh, 'export DEBIAN_FRONTEND=noninteractive && apt-get update -qq && apt-get upgrade -y -qq', '[1/8] System update...')

# Step 2
print('  [2/8] Installing Node.js 20 LTS...')
code, out = run(ssh, 'node --version 2>/dev/null')
if 'NOT_INSTALLED' in out or code != 0 or not out.startswith('v'):
    run(ssh, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', '  Fetching NodeSource setup...')
    run(ssh, 'apt-get install -y -qq nodejs', '  Installing nodejs...')
run(ssh, 'echo "Node $(node --version), npm $(npm --version)"', '  Versions:')

# Step 3
run(ssh, 'npm install -g pm2 --silent 2>/dev/null; pm2 --version', '[3/8] Installing PM2...')

# Step 4
run(ssh, 'export DEBIAN_FRONTEND=noninteractive && apt-get install -y -qq nginx', '[4/8] Installing nginx...')

# Step 5
run(ssh, 'mkdir -p /opt/starsim-terminal/data /opt/starsim-terminal/logs', '[5/8] Ensuring directories...')

# Step 6
print('  [6/8] Installing Node.js dependencies...')
run(ssh, 'cd /opt/starsim-terminal && npm install --production 2>&1 | tail -3', '  npm install:')

# Create .env if missing
run(ssh, """cd /opt/starsim-terminal && if [ ! -f .env ]; then
  JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  cp .env.production .env 2>/dev/null || cp .env.example .env 2>/dev/null || echo 'PORT=3777' > .env
  sed -i "s/CHANGE_ME_TO_A_RANDOM_STRING/$JWT/" .env
  echo 'Created .env with random JWT_SECRET'
else
  echo '.env already exists'
fi""", '  .env config:')

# Step 7
print('  [7/8] Starting server with PM2...')
run(ssh, 'cd /opt/starsim-terminal && pm2 delete starsim-terminal 2>/dev/null; pm2 start ecosystem.config.js', '  PM2 start:')
run(ssh, 'pm2 save && pm2 startup systemd -u root --hp /root 2>/dev/null; echo done', '  PM2 save/startup:')

# Step 8
print('  [8/8] Configuring nginx...')
nginx_conf = r"""server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location / {
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
    }
}"""
# Write nginx config via heredoc
run(ssh, f"cat > /etc/nginx/sites-available/starsim << 'ENDNGINX'\n{nginx_conf}\nENDNGINX", '  Writing nginx config...')
run(ssh, 'ln -sf /etc/nginx/sites-available/starsim /etc/nginx/sites-enabled/starsim && rm -f /etc/nginx/sites-enabled/default', '  Linking...')
run(ssh, 'nginx -t 2>&1 && systemctl reload nginx && echo OK', '  nginx test+reload:')

# Firewall
run(ssh, 'ufw allow 22/tcp 2>/dev/null; ufw allow 80/tcp 2>/dev/null; ufw allow 443/tcp 2>/dev/null; ufw --force enable 2>/dev/null; echo firewall done', '  Firewall:')

# Verify
print('\n  Verifying...')
time.sleep(3)
code, out = run(ssh, 'curl -s http://localhost:3777/api/health')
if '"ok"' in out or '"status":"ok"' in out:
    print('\n  === DEPLOYMENT SUCCESSFUL! ===')
    print(f'  Dashboard: http://{VPS_IP}')
    print(f'  API:       http://{VPS_IP}/api/health')
else:
    print(f'\n  Server response: {out}')
    run(ssh, 'pm2 logs starsim-terminal --lines 10 --nostream 2>&1', '  PM2 logs:')

ssh.close()
print('\nDone.')
