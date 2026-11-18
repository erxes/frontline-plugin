#!/usr/bin/env bash
# Runs erxes core's released images (ghcr.io/erxes/erxes-{api,web}:postgre) with
# core's own deploy/docker-compose.yml, plus this plugin's image (`pnpm image`).
#   e2e/stack.sh up     fresh database, returns once web and the plugin answer
#   e2e/stack.sh down   removes the stack and its volumes
set -euo pipefail
cd "$(dirname "$0")/.."

core=.scratch/core
env_file=.scratch/e2e.env
compose=(docker compose -p frontline-e2e -f "$core/deploy/docker-compose.yml" -f e2e/compose.yml --env-file "$env_file")

case "${1:-}" in
  up)
    if [ ! -d "$core" ]; then
      git clone --quiet --depth 1 --branch postgre --filter=blob:none --sparse https://github.com/erxes/erxes "$core"
      git -C "$core" sparse-checkout set deploy
    fi
    # A shallow pull refuses once postgre moves on; take its tip as it is.
    git -C "$core" fetch --quiet --depth 1 origin postgre
    git -C "$core" reset --quiet --hard FETCH_HEAD
    "$core/deploy/make-secrets.sh" > /dev/null
    [ -f "$env_file" ] || {
      echo "DATA_OWNER_PASSWORD=$(openssl rand -hex 16)"
      echo "DATA_APP_PASSWORD=$(openssl rand -hex 16)"
      echo "PLUGIN_SECRET=$(openssl rand -hex 24)"
    } > "$env_file"

    "${compose[@]}" down --volumes --remove-orphans > /dev/null 2>&1
    "${compose[@]}" pull --quiet postgres migrate api ui
    # Core migrates before its API starts; the plugin role needs core's schema.
    "${compose[@]}" up --detach --wait api ui
    # Core prints the new role's password on its own indented line. awk reads to the end, since
    # quitting early breaks compose's pipe and pipefail fails the stack.
    password=$("${compose[@]}" run --rm --no-deps migrate node dist/plugin-role.js frontline | awk '/^  [^ ]+$/ && !found { print $1; found = 1 }')
    [ -n "$password" ] || { echo "plugin-role printed no password" >&2; exit 1; }
    PLUGIN_DATA_PASSWORD=$password "${compose[@]}" up --detach --wait frontline
    echo "web http://localhost:8080, plugin http://localhost:3399"
    ;;
  down)
    "${compose[@]}" down --volumes --remove-orphans
    ;;
  logs)
    "${compose[@]}" logs --no-color --tail 300
    ;;
  *)
    echo "usage: e2e/stack.sh up|down|logs" >&2
    exit 1
    ;;
esac
