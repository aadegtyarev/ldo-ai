#!/bin/sh
set -eu

# Install or remove only ldo-ai's native Codex agents and skills.

mode=install
target=${HOME:-}/.codex/agents
[ -z "${CODEX_HOME:-}" ] || target=$CODEX_HOME/agents
case ${1-} in
  --uninstall) mode=uninstall; shift ;;
  --help|-h)
    printf '%s\n' 'Usage: install-codex.sh [--uninstall] [agents-directory]'
    exit 0
    ;;
esac
[ "$#" -le 1 ] || { printf '%s\n' 'Expected at most one agents-directory argument.' >&2; exit 2; }
[ "$#" -eq 0 ] || target=$1
[ "$#" -ne 0 ] || [ -n "${CODEX_HOME:-}${HOME:-}" ] || { printf '%s\n' 'CODEX_HOME or HOME must be set when no target directory is provided.' >&2; exit 2; }

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
case $target in /*) ;; *) target=$PWD/$target ;; esac
case $target in */) target=${target%/} ;; esac
skills_target=${target%/*}/skills
agent_source=$script_dir/../codex/agents
skill_source=$script_dir/../skills
owned_agents='planner.toml worker.toml reviewer.toml'
owned_skills='ldo-ai-workflow ldo-ai-decomposition ldo-ai-security ldo-ai-validation ldo-ai-git-delivery'

for directory in "$target" "$skills_target"; do
  if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; }; then
    printf 'Refusing unsafe target directory: %s\n' "$directory" >&2
    exit 1
  fi
done

if [ "$mode" = uninstall ]; then
  for name in $owned_agents; do
    file=$target/ldo-ai-$name
    if [ -L "$file" ] || { [ -e "$file" ] && { [ ! -f "$file" ] || ! grep -Fqx '# managed by ldo-ai' "$file"; }; }; then
      printf 'Refusing to remove unowned or linked file: %s\n' "$file" >&2
      exit 1
    fi
  done
  for name in $owned_skills; do
    directory=$skills_target/$name
    file=$directory/SKILL.md
    if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; } || [ -L "$file" ] || { [ -e "$file" ] && { [ ! -f "$file" ] || ! grep -Fqx '<!-- managed by ldo-ai -->' "$file"; }; }; then
      printf 'Refusing to remove unowned or linked skill: %s\n' "$file" >&2
      exit 1
    fi
  done
  for name in $owned_agents; do rm -f "$target/ldo-ai-$name"; done
  for name in $owned_skills; do rm -f "$skills_target/$name/SKILL.md"; done
  exit 0
fi

for name in $owned_agents; do
  [ -f "$agent_source/$name" ] || { printf 'Missing package agent: %s\n' "$agent_source/$name" >&2; exit 1; }
  file=$target/ldo-ai-$name
  if [ -L "$file" ] || { [ -e "$file" ] && { [ ! -f "$file" ] || ! grep -Fqx '# managed by ldo-ai' "$file"; }; }; then
    printf 'Refusing to replace unowned or linked file: %s\n' "$file" >&2
    exit 1
  fi
done
for name in $owned_skills; do
  [ -f "$skill_source/$name/SKILL.md" ] || { printf 'Missing package skill: %s\n' "$skill_source/$name/SKILL.md" >&2; exit 1; }
  directory=$skills_target/$name
  file=$directory/SKILL.md
  if [ -L "$directory" ] || { [ -e "$directory" ] && [ ! -d "$directory" ]; } || [ -L "$file" ] || { [ -e "$file" ] && { [ ! -f "$file" ] || ! grep -Fqx '<!-- managed by ldo-ai -->' "$file"; }; }; then
    printf 'Refusing to replace unowned or linked skill: %s\n' "$file" >&2
    exit 1
  fi
done
mkdir -p "$target" "$skills_target"
agent_tmp=$(mktemp -d "$target/.ldo-ai.XXXXXX")
skill_tmp=$(mktemp -d "$skills_target/.ldo-ai.XXXXXX")
cleanup() { rm -rf "$agent_tmp" "$skill_tmp"; }
trap cleanup EXIT HUP INT TERM
for name in $owned_agents; do cp "$agent_source/$name" "$agent_tmp/ldo-ai-$name"; done
for name in $owned_skills; do mkdir "$skill_tmp/$name"; cp "$skill_source/$name/SKILL.md" "$skill_tmp/$name/SKILL.md"; done
for name in $owned_agents; do mv -f "$agent_tmp/ldo-ai-$name" "$target/ldo-ai-$name"; done
for name in $owned_skills; do
  mkdir -p "$skills_target/$name"
  mv -f "$skill_tmp/$name/SKILL.md" "$skills_target/$name/SKILL.md"
done
