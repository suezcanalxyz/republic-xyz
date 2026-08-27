#!/usr/bin/env bash
# ops/deploy-atlas.sh — Deploy / update ATLAS on Oracle Cloud VM
# VM: ubuntu@204.216.210.155 (ARM A1, eu-milan-1)
# SSH key: C:\Users\repub\.ssh\seacommons_vm_rsa
# Usage (on VM): bash /home/ubuntu/atlas/ops/deploy-atlas.sh

set -euo pipefail

REPO=/home/ubuntu/atlas
NODE_PORT=3001

echo "=== [1/8] Pull latest code ==="
cd "$REPO"
git pull origin master

echo "=== [2/8] Install dependencies ==="
npm ci --prefer-offline

echo "=== [3/8] Build Next.js (standalone) ==="
NODE_ENV=production npm run build

# Standalone build: copy public + static assets into .next/standalone
echo "=== [3b] Copy static assets into standalone ==="
cp -r .next/static .next/standalone/.next/static
cp -r public        .next/standalone/public

echo "=== [4/8] Check /etc/atlas.env ==="
if [ ! -f /etc/atlas.env ]; then
    echo ""
    echo "  ERROR: /etc/atlas.env missing."
    echo "  Create from ops/.env.production.example:"
    echo "    sudo cp $REPO/ops/.env.production.example /etc/atlas.env"
    echo "    sudo nano /etc/atlas.env"
    echo "    sudo chmod 600 /etc/atlas.env"
    echo ""
    exit 1
fi
sudo chmod 600 /etc/atlas.env

echo "=== [5/8] Install systemd service ==="
sudo cp "$REPO/ops/atlas.service" /etc/systemd/system/atlas.service
sudo systemctl daemon-reload
sudo systemctl enable atlas

echo "=== [6/8] Install nginx vhost ==="
sudo cp "$REPO/ops/nginx-atlas.conf" /etc/nginx/sites-available/atlas
sudo ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/atlas
sudo nginx -t
sudo systemctl reload nginx

echo "=== [7/8] Restart ATLAS ==="
sudo systemctl restart atlas
sleep 5
sudo systemctl status atlas --no-pager

echo "=== [8/8] Health check ==="
curl -sf "http://127.0.0.1:${NODE_PORT}/api/atlas/globe?zoom=2&limit=10" \
    && echo "  ATLAS API OK" \
    || echo "  FAILED — check: sudo journalctl -u atlas -n 50"

echo ""
echo "Done. Tail logs: sudo journalctl -u atlas -f"
echo "Public URL:      https://republic.suezcanal.xyz"
echo ""
echo "First deploy? Also run:"
echo "  sudo certbot --nginx -d republic.suezcanal.xyz"
echo "  crontab -e  # paste contents of ops/crontab.txt"
