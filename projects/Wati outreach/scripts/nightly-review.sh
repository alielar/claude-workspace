#!/bin/zsh
# Veille du soir : compare ce qu'Ali a envoyé aujourd'hui à ce qui avait été proposé, et logge les leçons.
# À lancer par launchd (scripts/com.ali.wati-nightly-review.plist, 21:03 Europe/Madrid) ou à la main :
#   zsh scripts/nightly-review.sh
# Ne lance rien d'autre que `claude -p` en lecture/édition du playbook. Jamais send.mjs.
# --setting-sources project,local : les réglages globaux (~/.claude/settings.json) contiennent une règle grep malformée
# qui fait refuser toute commande en mode non surveillé (veille du 26/09 bloquée) ; on ne les charge pas.
export PATH="/Users/alielaraki/.nvm/versions/node/v24.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin"
export HOME="/Users/alielaraki"
cd "/Users/alielaraki/claude-workspace/projects/Wati outreach" || exit 1
mkdir -p logs data/nightly data/suggestions
TODAY=$(date +%F)
LOG="logs/nightly-$TODAY.log"
echo "=== nightly review start $(date) ===" >> "$LOG"
claude -p "$(cat scripts/nightly-review-prompt.md)" \
  --model claude-sonnet-5 \
  --permission-mode acceptEdits \
  --setting-sources project,local \
  --allowedTools "Bash(node:*),Bash(/Users/alielaraki/.nvm/versions/node/v24.14.0/bin/node:*),Bash(~/.nvm/versions/node/v24.14.0/bin/node:*),Bash(python3:*),Bash(date:*),Bash(ls:*),Bash(cat:*),Bash(head:*),Bash(tail:*),Bash(grep:*),Bash(sed:*),Bash(wc:*),Bash(stat:*),Read,Edit,Write,Grep,Glob" \
  --max-turns 60 \
  >> "$LOG" 2>&1
echo "=== nightly review end $(date) exit=$? ===" >> "$LOG"
