#!/bin/sh
# Opens the daily veille session in a Terminal window at 09:00 Morocco time.
# launchd calls this every hour from 08:00 to 11:00 (Mac local time); this
# script decides whether it is 09:00 in Casablanca and whether a session is
# already running. `sh veille.sh --now` starts one immediately.
DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE="$DIR/data/veille-force"   # touch this file to make the next launchd run start a session
if [ -f "$FORCE" ]; then rm -f "$FORCE"; elif [ "$1" != "--now" ] && [ "$(TZ=Africa/Casablanca date +%H)" != "09" ]; then exit 0; fi
if pgrep -f "claude --model claude-sonnet-5 veille" >/dev/null 2>&1; then exit 0; fi   # a veille session is already open
echo "$(date "+%F %T") starting veille session" >> "$DIR/logs/veille.log"
# `open` hands the script to Terminal without AppleScript (no Automation permission needed).
open -a Terminal "$DIR/veille-terminal.command" >> "$DIR/logs/veille.log" 2>&1
