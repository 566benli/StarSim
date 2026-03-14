#!/bin/bash
##############################################################################
#  StarSim Central Terminal — One-Click VPS Deployment Script
#
#  Run on a fresh Ubuntu 22.04+ VPS:
#    curl -sSL https://raw.githubusercontent.com/YOUR_REPO/server/deploy.sh | bash
#  or upload this file and run:  bash deploy.sh
##############################################################################
set -e

APP_DIR="/opt/starsim-terminal"
USER="starsim"

echo ""
echo "  ✦  StarSim Central Terminal — VPS Deployment"
echo "  ================================================"
echo ""

# ── Step 1: System update ─────────────────────────────────────────────
echo "[1/8] Updating system packages..."
sudo apt update -qq && sudo apt upgrade -y -qq

# ── Step 2: Install Node.js 20 LTS ───────────────────────────────────
echo "[2/8] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y -qq nodejs
fi
echo "  Node.js $(node -v), npm $(npm -v)"

# ── Step 3: Install PM2 globally ─────────────────────────────────────
echo "[3/8] Installing PM2 process manager..."
sudo npm install -g pm2 --silent

# ── Step 4: Install nginx ────────────────────────────────────────────
echo "[4/8] Installing nginx..."
sudo apt install -y -qq nginx

# ── Step 5: Create app user and directory ─────────────────────────────
echo "[5/8] Setting up application directory..."
sudo mkdir -p "$APP_DIR"

if [ -d "./server" ]; then
    echo "  Copying from local ./server directory..."
    sudo cp -r ./server/* "$APP_DIR/"
elif [ -d "." ] && [ -f "./server.js" ]; then
    echo "  Copying from current directory..."
    sudo cp -r ./* "$APP_DIR/"
else
    echo "  ERROR: No server files found. Upload the server/ folder first."
    echo "  You can use: scp -r server/ root@YOUR_VPS_IP:/opt/starsim-terminal/"
    exit 1
fi

cd "$APP_DIR"

# ── Step 6: Install dependencies and configure ───────────────────────
echo "[6/8] Installing Node.js dependencies..."
sudo npm install --production --silent

if [ ! -f ".env" ]; then
    echo "  Creating .env from template..."
    JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
    sudo cp .env.production .env 2>/dev/null || sudo cp .env.example .env 2>/dev/null || true
    sudo sed -i "s/CHANGE_ME_TO_A_RANDOM_STRING/$JWT/" .env
    echo "  ✓ Generated random JWT_SECRET"
fi

sudo mkdir -p data logs

# ── Step 7: Start with PM2 ───────────────────────────────────────────
echo "[7/8] Starting server with PM2..."
cd "$APP_DIR"
pm2 delete starsim-terminal 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# ── Step 8: Configure nginx ──────────────────────────────────────────
echo "[8/8] Configuring nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/starsim > /dev/null <<'NGINX'
server {
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
        proxy_send_timeout 60s;
        client_max_body_size 10M;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/starsim /etc/nginx/sites-enabled/starsim
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── Configure firewall ───────────────────────────────────────────────
echo "  Opening firewall ports (22, 80, 443)..."
sudo ufw allow 22/tcp 2>/dev/null || true
sudo ufw allow 80/tcp 2>/dev/null || true
sudo ufw allow 443/tcp 2>/dev/null || true
sudo ufw --force enable 2>/dev/null || true

# ── Verify ────────────────────────────────────────────────────────────
echo ""
sleep 2
STATUS=$(curl -s http://localhost:3777/api/health 2>/dev/null || echo '{"status":"error"}')
if echo "$STATUS" | grep -q '"ok"'; then
    echo "  ✦  DEPLOYMENT SUCCESSFUL!"
else
    echo "  ⚠  Server may still be starting. Check: pm2 logs starsim-terminal"
fi

IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")
echo ""
echo "  ================================================"
echo "  ✦  Central Terminal is live!"
echo ""
echo "  Dashboard:  http://$IP"
echo "  API:        http://$IP/api"
echo "  Health:     http://$IP/api/health"
echo ""
echo "  ── Next steps ──"
echo "  1. Point your domain DNS (A record) to: $IP"
echo "  2. Install SSL:  sudo apt install certbot python3-certbot-nginx"
echo "                   sudo certbot --nginx -d YOUR_DOMAIN"
echo "  3. Update StarSim client URL to: https://YOUR_DOMAIN"
echo ""
echo "  ── Useful commands ──"
echo "  pm2 status              — check server status"
echo "  pm2 logs starsim-terminal — view live logs"
echo "  pm2 restart starsim-terminal — restart server"
echo "  ================================================"
echo ""
