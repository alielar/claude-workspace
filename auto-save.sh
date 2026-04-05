#!/bin/zsh

WORKSPACE=~/claude-workspace
cd "$WORKSPACE" || exit 1

# Add all changes
git add -A

# Only commit if there are changes
if ! git diff --cached --quiet; then
  git commit -m "auto-save: $(date '+%Y-%m-%d %H:%M')"
  git push origin main
fi
