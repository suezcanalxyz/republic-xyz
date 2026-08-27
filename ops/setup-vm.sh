#!/usr/bin/env bash
# ops/setup-vm.sh — One-time ATLAS setup on Oracle VM
# VM: ubuntu@204.216.210.155 (ARM A1, eu-milan-1)
# SSH: ssh -i C:\Users\repub\.ssh\seacommons_vm_rsa ubuntu@204.216.210.155
#
# IMPORTANT: SeaCommons already runs on this VM (port 8000, seacommons-api.service).
# This script does NOT touch SeaCommons. Only adds ATLAS alongside it.
# Does NOT run apt upgrade (could disrupt seacommons-api service).

set -euo pipefail

echo "=== [1] Install Node.js 20 LTS (if not present) ==="
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "  Node.js $(node --version) already installed"
fi

echo "=== [2] Install certbot (if not present) ==="
if ! command -v certbot &>/dev/null; then
    sudo apt-get install -y certbot python3-certbot-nginx
else
    echo "  certbot already installed"
fi

echo "=== [3] Install Ollama (if not present) ==="
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
    sudo systemctl enable ollama
    sudo systemctl start ollama
    echo "  Pulling llama3.1:8b (~4.5 GB)..."
    ollama pull llama3.1:8b
else
    echo "  Ollama already installed ($(ollama --version))"
    # Ensure model is pulled
    ollama pull llama3.1:8b 2>/dev/null || true
fi

echo "=== [4] Clone ATLAS repo ==="
if [ ! -d /home/ubuntu/atlas ]; then
    # Update this URL to your actual repo
    git clone https://github.com/suezcanalxyz/republic-xyz.git /home/ubuntu/atlas
    echo "  Cloned to /home/ubuntu/atlas"
else
    echo "  /home/ubuntu/atlas already exists"
fi

echo "=== [5] Create /etc/atlas.env (if not present) ==="
if [ ! -f /etc/atlas.env ]; then
    sudo cp /home/ubuntu/atlas/ops/.env.production.example /etc/atlas.env
    sudo chmod 600 /etc/atlas.env
    echo ""
    echo "  ACTION REQUIRED: fill in /etc/atlas.env before deploying"
    echo "    sudo nano /etc/atlas.env"
    echo ""
fi

echo "=== [6] Create cron log file ==="
sudo touch /var/log/atlas-cron.log
sudo chown ubuntu:ubuntu /var/log/atlas-cron.log

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. sudo nano /etc/atlas.env              # set CRON_SECRET, CESIUM token"
echo "  2. bash /home/ubuntu/atlas/ops/deploy-atlas.sh"
echo "  3. sudo certbot --nginx -d republic.suezcanal.xyz"
echo "  4. crontab -e                             # APPEND ops/crontab.txt — do NOT delete existing SeaCommons cron entries"
echo ""
echo "Ports in use on this VM:"
echo "  8000 → SeaCommons API (seacommons-api.service) — DO NOT TOUCH"
echo "  3001 → ATLAS (atlas.service) — new"
echo "  80/443 → nginx (shared, separate server_name blocks)"
