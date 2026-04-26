#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
find "$PROJECT_DIR/releases/backups" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print -exec rm -rf {} +
find "$PROJECT_DIR/releases/packages" -mindepth 1 -maxdepth 1 -type f -name "*.tar.gz" -mtime +14 -print -delete
