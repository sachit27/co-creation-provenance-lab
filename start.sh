#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Co-Creation Provenance Lab — Quick Start Script
#
# Opens three terminal windows / tabs (macOS + Linux):
#   1. BGE-M3 embedding server  →  http://localhost:5001
#   2. (Optional) Ollama         →  http://localhost:11434
#   3. Frontend dev server       →  http://localhost:5173
#
# Usage:
#   chmod +x start.sh
#   ./start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Helpers ──────────────────────────────────────────────────────────────────

open_terminal_macos() {
  local title="$1"
  local cmd="$2"
  osascript <<EOF
tell application "Terminal"
  do script "echo '\033[1;36m--- $title ---\033[0m' && $cmd"
  activate
end tell
EOF
}

open_terminal_linux() {
  local title="$1"
  local cmd="$2"
  if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="$title" -- bash -c "$cmd; exec bash" &
  elif command -v xterm &>/dev/null; then
    xterm -T "$title" -e "bash -c '$cmd; exec bash'" &
  else
    echo "  ⚠  Could not open a terminal window. Run manually: $cmd"
  fi
}

open_terminal() {
  if [[ "$OSTYPE" == darwin* ]]; then
    open_terminal_macos "$1" "$2"
  else
    open_terminal_linux "$1" "$2"
  fi
}

# ── Pre-flight checks ────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Co-Creation Provenance Lab — Quick Start            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 is required. Install from https://python.org"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo "❌  Node.js / npm is required. Install from https://nodejs.org"
  exit 1
fi

# ── 1. BGE-M3 Embedding Server ───────────────────────────────────────────────

echo "▶  [1/3] Starting BGE-M3 embedding server on http://localhost:5001"
echo "         First run downloads the BGE-M3 model (~2 GB) — please wait."
echo ""

BGE_CMD="cd '$ROOT' && pip3 install --quiet -r requirements-embedding.txt && python3 embedding_server.py"
open_terminal "BGE-M3 Embedding Server" "$BGE_CMD"

sleep 1

# ── 2. Ollama (optional) ─────────────────────────────────────────────────────

echo "▶  [2/3] Ollama (optional local LLM)"
if command -v ollama &>/dev/null; then
  echo "         Ollama is installed."
  echo "         → Start it:    ollama serve"
  echo "         → Pull model:  ollama pull llama3"
  echo "         (Skipping auto-start — run manually if needed)"
else
  echo "         Ollama not found. Install from https://ollama.com for local AI."
  echo "         (Alternatively, enter a Gemini API key in the UI.)"
fi
echo ""

# ── 3. Frontend Dev Server ───────────────────────────────────────────────────

echo "▶  [3/3] Starting frontend dev server on http://localhost:5173"
echo ""

FRONTEND_CMD="cd '$ROOT' && npm ci && npm run dev"
open_terminal "Provenance Lab Frontend" "$FRONTEND_CMD"

sleep 1

# ── Summary ──────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════"
echo "  Services starting in separate terminals:"
echo ""
echo "  Frontend:        http://localhost:5173"
echo "  BGE-M3 server:   http://localhost:5001"
echo ""
echo "  Open http://localhost:5173 in your browser."
echo "═══════════════════════════════════════════════════════════════"
echo ""
