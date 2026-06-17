#!/usr/bin/env zsh
set -euo pipefail

label="com.joey.moi.epsilon-scanner-intake"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
template_path="$repo_dir/scripts/${label}.plist.tmpl"
launch_agent_dir="$HOME/Library/LaunchAgents"
plist_path="$launch_agent_dir/${label}.plist"
node_path="$(command -v node)"
service_js="$repo_dir/dist-electron/scanner/scanner-intake-service.js"

render_plist() {
  sed \
    -e "s#__NODE__#$node_path#g" \
    -e "s#__SERVICE_JS__#$service_js#g" \
    "$template_path"
}

if [[ "${1:-}" != "--install" ]]; then
  print "Dry run: would render $template_path to $plist_path"
  print "Dry run: would create $launch_agent_dir"
  print "Dry run: would load $label with launchctl bootstrap gui/$(id -u) $plist_path"
  print "Run with --install to write and load the user LaunchAgent."
  exit 0
fi

mkdir -p "$launch_agent_dir" "$HOME/Library/Logs"
render_plist > "$plist_path"
launchctl bootout "gui/$(id -u)" "$plist_path" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$plist_path"
launchctl enable "gui/$(id -u)/$label"
print "Installed $label at $plist_path"
