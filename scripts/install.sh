#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
[ -f ./.env ] || cp .env.example .env
npm install --omit=dev
npm run migrate
if pm2 describe lanzou-site >/dev/null 2>&1; then pm2 restart lanzou-site; else pm2 start app.js --name lanzou-site; fi
pm2 save
echo "[OK] install success: $PROJECT_DIR"
