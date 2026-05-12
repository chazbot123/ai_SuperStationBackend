#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/data/ai-superweb}"
SERVER_DIR="${SERVER_DIR:-$APP_ROOT/server}"
LOG_DIR="${LOG_DIR:-$APP_ROOT/logs}"
DISPLAY_NUM="${DISPLAY_NUM:-:99}"
XVFB_WHD="${XVFB_WHD:-1920x1080x24}"
XVFB_LOG_FILE="${XVFB_LOG_FILE:-$LOG_DIR/xvfb.log}"

mkdir -p "$LOG_DIR"

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "[start-server-with-xvfb] Xvfb not found. Install it first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[start-server-with-xvfb] node not found. Install Node.js first." >&2
  exit 1
fi

if [ ! -f "$SERVER_DIR/dist/main.js" ]; then
  echo "[start-server-with-xvfb] Missing $SERVER_DIR/dist/main.js" >&2
  exit 1
fi

if ! pgrep -f "Xvfb ${DISPLAY_NUM}" >/dev/null 2>&1; then
  nohup Xvfb "$DISPLAY_NUM" -screen 0 "$XVFB_WHD" -ac -nolisten tcp >"$XVFB_LOG_FILE" 2>&1 &
  sleep 2
fi

export DISPLAY="$DISPLAY_NUM"
export PUBLISHING_BROWSER_HEADLESS="${PUBLISHING_BROWSER_HEADLESS:-false}"

cd "$SERVER_DIR"
exec node dist/main.js
