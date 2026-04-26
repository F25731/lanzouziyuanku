#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$PROJECT_DIR"
PROJECT_NAME=$(node -p "require(\"./package.json\").name")
PROJECT_VERSION=$(node -p "require(\"./package.json\").version")
STAMP=$(date +%Y%m%d_%H%M%S)
OUT_DIR="$PROJECT_DIR/releases/packages"
mkdir -p "$OUT_DIR"
PACKAGE_FILE="$OUT_DIR/${PROJECT_NAME}_v${PROJECT_VERSION}_${STAMP}.tar.gz"
tar --exclude=./.env --exclude=./node_modules --exclude=./releases --exclude=./logs --exclude=./.git --exclude=./lanzou-site --exclude=*/__pycache__ --exclude=*.pyc --exclude=*.bak* --exclude=*.save -czf "$PACKAGE_FILE" .
echo "$PACKAGE_FILE"
