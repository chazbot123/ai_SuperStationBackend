#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y xvfb x11-utils fonts-liberation libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
  libcups2t64 libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxfixes3 libxkbcommon0 libxrandr2 wget

if ! command -v google-chrome >/dev/null 2>&1; then
  TMP_DEB="/tmp/google-chrome-stable_current_amd64.deb"
  wget -O "$TMP_DEB" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt install -y "$TMP_DEB"
  rm -f "$TMP_DEB"
fi

Xvfb -help >/dev/null 2>&1 || true
google-chrome --version
echo "[install-ubuntu-xvfb-browser] Xvfb and Chrome are ready."
