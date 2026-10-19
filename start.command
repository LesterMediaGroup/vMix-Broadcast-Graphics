#!/bin/bash
# Mac starter: double-click in Finder (the Mac version of start.bat).
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found on this Mac."
  echo
  echo "Install it from https://nodejs.org - choose the LTS version - then run this file again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies for the first time - this only happens once..."
  if ! npm install --omit=dev; then
    echo
    echo "npm install failed. Check your internet connection and try again."
    read -n 1 -s -r -p "Press any key to close."
    exit 1
  fi
fi

IFACE=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
IP=$([ -n "$IFACE" ] && ipconfig getifaddr "$IFACE" 2>/dev/null)
echo
echo "Starting Broadcast Graphics..."
echo "Dashboard: http://localhost:4174"
[ -n "$IP" ] && echo "vMix on other computers: http://$IP:4174/out/..."
echo "It restarts by itself when the app's code is updated."
echo "Close this window to stop it."
echo

npm start
