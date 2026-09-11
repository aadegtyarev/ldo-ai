#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="${1:-$HERE/install-codex.sh}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
TARGET="$WORK/target"
mkdir -p "$TARGET"
printf '%s\n' '# Project instructions' 'Keep this line.' > "$TARGET/AGENTS.md"

bash "$INSTALLER" --ignore-codex "$TARGET" >/dev/null
for path in core/pipeline.mjs adapters/codex-cli.mjs schemas/planner.json agents/planner.md scripts/ldo-run.mjs LDO_INSTALLED.md; do
  test -f "$TARGET/.codex/ldo/$path"
done
grep -q 'Keep this line.' "$TARGET/AGENTS.md"
grep -q '<!-- BEGIN ldo-codex -->' "$TARGET/AGENTS.md"
grep -q 'node .codex/ldo/scripts/ldo-run.mjs --runtime codex --isolate' "$TARGET/AGENTS.md"
grep -q 'You are an LDO subagent' "$TARGET/AGENTS.md"
grep -Fxq '.codex/' "$TARGET/.gitignore"

bash "$INSTALLER" --ignore-codex "$TARGET" >/dev/null
test "$(grep -c '<!-- BEGIN ldo-codex -->' "$TARGET/AGENTS.md")" = 1
test "$(grep -Fxc '.codex/' "$TARGET/.gitignore")" = 1
echo '✓ Codex project installation preserves instructions and installs one LDO router.'
