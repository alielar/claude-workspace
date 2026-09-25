#!/bin/zsh
# Runs inside the Terminal window opened by veille.sh: refresh the Tailscale
# certificate, then start the Claude Code veille session (Sonnet).
cd "$(dirname "$0")"
LOG="$PWD/logs/veille-terminal.log"
echo "$(date '+%F %T') window opened" >> "$LOG"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
(cd ../wati-inbox && node --env-file=.env renew-ts-cert.mjs 2>/dev/null) && echo "$(date '+%F %T') certificate ok" >> "$LOG"
command -v claude >/dev/null || { echo "$(date '+%F %T') claude not found in PATH" >> "$LOG"; echo "claude introuvable — ouvrez un nouveau Terminal et lancez : claude --model claude-sonnet-5 veille"; exec zsh; }
echo "$(date '+%F %T') starting claude" >> "$LOG"
echo "Veille Wati Inbox — $(date '+%a %d %b %H:%M') — Ctrl-C ou /exit pour arrêter"
claude --model claude-sonnet-5 "veille"
echo "$(date '+%F %T') claude exited ($?)" >> "$LOG"
exec zsh
