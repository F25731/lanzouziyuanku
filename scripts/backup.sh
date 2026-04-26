#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
set -a
[ -f ./.env ] && . ./.env
set +a
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$PROJECT_DIR/releases/backups/$STAMP"
mkdir -p "$BACKUP_DIR"
tar --exclude=./node_modules --exclude=./releases --exclude=./logs --exclude=./.git -czf "$BACKUP_DIR/code.tar.gz" .
MYSQL_PWD="${DB_PASSWORD:-}" mysqldump --no-tablespaces -h"${DB_HOST:-127.0.0.1}" -P"${DB_PORT:-3306}" -u"${DB_USER:?missing DB_USER}" --default-character-set=utf8mb4 --single-transaction "${DB_NAME:?missing DB_NAME}" > "$BACKUP_DIR/db.sql"
printf "{\n  \"created_at\": \"%s\",\n  \"backup_dir\": \"%s\"\n}\n" "$(date "+%F %T")" "$BACKUP_DIR" > "$BACKUP_DIR/meta.json"
echo "$BACKUP_DIR"
