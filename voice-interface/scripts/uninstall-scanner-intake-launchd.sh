#!/usr/bin/env zsh
set -euo pipefail

label="com.joey.moi.epsilon-scanner-intake"
plist_path="$HOME/Library/LaunchAgents/${label}.plist"

if [[ "${1:-}" != "--uninstall" ]]; then
  print "Dry run: would unload $label from $plist_path"
  print "Dry run: would remove $plist_path"
  print "Run with --uninstall to mutate launchd state and remove the user LaunchAgent."
  exit 0
fi

launchctl bootout "gui/$(id -u)" "$plist_path" >/dev/null 2>&1 || true
rm -f "$plist_path"
print "Uninstalled $label"
