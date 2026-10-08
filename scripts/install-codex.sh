#!/bin/sh
set -eu

# Install or remove only ldo-ai's native Codex agent definitions.

mode=install
target=${HOME:-}/.codex/agents
case ${1-} in
  --uninstall) mode=uninstall; shift ;;
  --help|-h)
    printf '%s\n' 'Usage: install-codex.sh [--uninstall] [agents-directory]'
    exit 0
    ;;
esac
[ "$#" -le 1 ] || { printf '%s\n' 'Expected at most one agents-directory argument.' >&2; exit 2; }
[ "$#" -eq 0 ] || target=$1
[ "$#" -ne 0 ] || [ -n "${HOME:-}" ] || { printf '%s\n' 'HOME must be set when no target directory is provided.' >&2; exit 2; }

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
case $target in /*) ;; *) target=$PWD/$target ;; esac
source_dir=$script_dir/../codex/agents
owned='planner.toml worker.toml reviewer.toml'

if [ "$mode" = uninstall ]; then
  for name in $owned; do
    file=$target/ldo-ai-$name
    if [ -e "$file" ] && ! grep -Fqx '# managed by ldo-ai' "$file"; then
      printf 'Refusing to remove unowned file: %s\n' "$file" >&2
      exit 1
    fi
  done
  for name in $owned; do rm -f "$target/ldo-ai-$name"; done
  exit 0
fi

for name in $owned; do
  [ -f "$source_dir/$name" ] || { printf 'Missing package agent: %s\n' "$source_dir/$name" >&2; exit 1; }
  file=$target/ldo-ai-$name
  if [ -e "$file" ] && ! grep -Fqx '# managed by ldo-ai' "$file"; then
    printf 'Refusing to replace unowned file: %s\n' "$file" >&2
    exit 1
  fi
done
mkdir -p "$target"
tmp=$(mktemp -d "$target/.ldo-ai.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for name in $owned; do cp "$source_dir/$name" "$tmp/ldo-ai-$name"; done
for name in $owned; do mv -f "$tmp/ldo-ai-$name" "$target/ldo-ai-$name"; done
