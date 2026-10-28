#!/bin/zsh
# Double-click to edit the M07L3Y Media website on this Mac.
# Opens the site in your browser with the editing toolbar. Keep this window open while editing.
cd "$(dirname "$0")" || exit 1

# Load the same setup as a normal Terminal window (conda, nvm, Homebrew) so `node` is found
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile" >/dev/null 2>&1
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" >/dev/null 2>&1
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$PATH:$HOME/.homebrew/bin:/opt/homebrew/bin:/usr/local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js wasn't found. In Terminal run:  cd ~/m07l3y-website && node editor/server.mjs --open"
  echo ""
  read -k 1 -s "?  Press any key to close."
  exit 1
fi

node editor/server.mjs --open
