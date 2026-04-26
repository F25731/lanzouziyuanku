#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
bash scripts/backup.sh > /tmp/lanzou_last_backup_path.txt
BACKUP_DIR=$(cat /tmp/lanzou_last_backup_path.txt)
trap 'echo "[FAIL] update failed, rollback -> $BACKUP_DIR"; bash scripts/rollback.sh "$BACKUP_DIR"' ERR
npm install --omit=dev
npm run migrate
npm run check
pm2 restart lanzou-site
echo "[OK] update success, backup=$BACKUP_DIR"
