#!/bin/sh
# CPF question to offer-rejected leads (2026-10-06 → 2026-10-16, answers counted until 2026-10-24).
# Runs cpf-campaign.mjs tick at 12:30 (send), 15:30 (catch-up if the Mac slept), 20:30 (answers + push).
# Remove when done:  launchctl bootout gui/$(id -u)/com.ali.wati-cpf && rm ~/Library/LaunchAgents/com.ali.wati-cpf.plist
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(ls "$HOME"/.nvm/versions/node/*/bin/node | tail -1)"
PLIST="$HOME/Library/LaunchAgents/com.ali.wati-cpf.plist"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.ali.wati-cpf</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--env-file=.env</string><string>cpf-campaign.mjs</string><string>tick</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>15</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin</string><key>HOME</key><string>$HOME</string><key>TZ</key><string>Europe/Paris</string></dict>
  <key>StandardOutPath</key><string>$DIR/logs/cpf.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/cpf.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)/com.ali.wati-cpf" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed com.ali.wati-cpf. Log: $DIR/logs/cpf.log"
