#!/bin/sh
# Installs (or re-installs) the launchd job so the server starts at login and
# restarts if it crashes. Run from anywhere:  sh launchd/install.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || ls "$HOME"/.nvm/versions/node/*/bin/node | tail -1)"
PLIST="$HOME/Library/LaunchAgents/com.ali.wati-inbox.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/logs"
cat > "$PLIST" <<X
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ali.wati-inbox</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--env-file=.env</string><string>server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin</string><key>HOME</key><string>$HOME</string></dict>
  <key>StandardOutPath</key><string>$DIR/logs/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/server.log</string>
</dict></plist>
X
launchctl bootout "gui/$(id -u)/com.ali.wati-inbox" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. Server log: $DIR/logs/server.log"
