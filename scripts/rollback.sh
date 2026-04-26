#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${1:?usage: bash scripts/rollback.sh /abs/path/to/backup_dir}"
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
[ -f "$BACKUP_DIR/code.tar.gz" ] || { echo "missing $BACKUP_DIR/code.tar.gz"; exit 1; }
[ -f "$BACKUP_DIR/db.sql" ] || { echo "missing $BACKUP_DIR/db.sql"; exit 1; }
set -a
[ -f ./.env ] && . ./.env
set +a
TMP_DIR="$PROJECT_DIR/releases/rollback_tmp_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TMP_DIR"
tar -xzf "$BACKUP_DIR/code.tar.gz" -C "$TMP_DIR"
find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 ! -name releases ! -name logs ! -name node_modules ! -name .git -exec rm -rf {} +
cp -a "$TMP_DIR"/. "$PROJECT_DIR"/
MYSQL_PWD="${DB_PASSWORD:-}" mysql -h"${DB_HOST:-127.0.0.1}" -P"${DB_PORT:-3306}" -u"${DB_USER:?missing DB_USER}" "${DB_NAME:?missing DB_NAME}" < "$BACKUP_DIR/db.sql"
rm -rf "$TMP_DIR"
pm2 restart lanzou-site
echo "rollback done: $BACKUP_DIR"
