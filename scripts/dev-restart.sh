#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"

PROXY_PORT="${PROXY_PORT:-3000}"
VITE_PORT="${VITE_PORT:-5173}"
API_PORT="${API_PORT:-8000}"

validate_port() {
  local name="$1"
  local value="$2"

  if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    echo "Invalid $name: $value" >&2
    exit 1
  fi
}

pids_on_port() {
  local port="$1"
  lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true
}

wait_for_port_to_close() {
  local port="$1"
  local pids=""

  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    pids="$(pids_on_port "$port")"
    if [ -z "$pids" ]; then
      return 0
    fi
    sleep 0.25
  done

  return 1
}

show_processes() {
  local pids="$1"
  local pid_list=""

  pid_list="$(printf "%s" "$pids" | paste -sd, -)"
  ps -o pid= -o ppid= -o command= -p "$pid_list" 2>/dev/null || true
}

close_port() {
  local label="$1"
  local port="$2"
  local pids=""

  pids="$(pids_on_port "$port")"
  if [ -z "$pids" ]; then
    echo "OK: $label port $port is free."
    return 0
  fi

  echo "Found existing $label listener(s) on port $port:"
  show_processes "$pids"
  echo "Stopping $label listener(s) on port $port..."
  kill -TERM $pids 2>/dev/null || true

  if wait_for_port_to_close "$port"; then
    echo "OK: $label port $port is free."
    return 0
  fi

  pids="$(pids_on_port "$port")"
  if [ -n "$pids" ]; then
    echo "Port $port is still busy; forcing shutdown:"
    show_processes "$pids"
    kill -KILL $pids 2>/dev/null || true
  fi

  if ! wait_for_port_to_close "$port"; then
    echo "Failed to free $label port $port." >&2
    exit 1
  fi

  echo "OK: $label port $port is free."
}

validate_port "PROXY_PORT" "$PROXY_PORT"
validate_port "VITE_PORT" "$VITE_PORT"
validate_port "API_PORT" "$API_PORT"

echo "Preparing LoreWeaver dev server..."
close_port "Express gateway" "$PROXY_PORT"
close_port "Vite frontend" "$VITE_PORT"
close_port "FastAPI backend" "$API_PORT"

export PORT="$PROXY_PORT"
export VITE_DEV_PORT="$VITE_PORT"
export PYTHON_BACKEND_PORT="$API_PORT"

echo "Starting LoreWeaver on http://localhost:$PROXY_PORT ..."
exec tsx server.ts
