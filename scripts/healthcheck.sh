#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
set -a
[ -f ./.env ] && . ./.env
set +a
pm2 describe lanzou-site >/dev/null 2>&1
node -e "const { pool } = require(\"./config/db\"); pool.query(\"SELECT 1 AS ok\").then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });"
node -e "const { createClient } = require(\"redis\"); const c=createClient({ socket:{ host: process.env.REDIS_HOST || \"127.0.0.1\", port: Number(process.env.REDIS_PORT || 6379) }, password: process.env.REDIS_PASSWORD || undefined }); c.on(\"error\", err => { console.error(err); process.exit(1); }); c.connect().then(() => c.ping()).then(() => c.quit()).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });"
node -e "const http=require(\"http\"); const port=Number(process.env.PORT || 3000); http.get({ host:\"127.0.0.1\", port, path:\"/front-v2\" }, res => { if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) { process.exit(0); } console.error(\"bad status\", res.statusCode); process.exit(1); }).on(\"error\", err => { console.error(err); process.exit(1); });"
echo "[OK] healthcheck passed"
