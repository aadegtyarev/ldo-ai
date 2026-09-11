#!/usr/bin/env bash
# Install LDO as project-local Codex runtime and enable its AGENTS.md router.
#
# Usage: scripts/install-codex.sh <target-project-dir>
#
# The copied runtime is deliberately project-local. It makes the routing rule
# reproducible for everyone who opens the target with Codex, without requiring
# a global package install or changing the user's Codex configuration.

set -euo pipefail

TARGET="${1:?Usage: scripts/install-codex.sh <target-project-dir>}"

if [ ! -d "$TARGET" ]; then
  echo "error: target directory does not exist: $TARGET" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for path in core adapters schemas agents scripts/ldo-run.mjs; do
  if [ ! -e "$SRC/$path" ]; then
    echo "error: could not find LDO source root above $(dirname "${BASH_SOURCE[0]}") — missing $path" >&2
    exit 1
  fi
done

if [ "$SRC" = "$TARGET" ]; then
  echo "error: target is the LDO source itself — refusing to install into its own repo" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
RUNTIME="$STAGE/.codex/ldo"
mkdir -p "$RUNTIME/core" "$RUNTIME/adapters" "$RUNTIME/schemas" "$RUNTIME/agents" "$RUNTIME/scripts"
cp "$SRC"/core/*.mjs "$RUNTIME/core/"
cp "$SRC"/adapters/*.mjs "$RUNTIME/adapters/"
cp "$SRC"/schemas/*.json "$RUNTIME/schemas/"
cp "$SRC"/agents/*.md "$RUNTIME/agents/"
cp "$SRC"/scripts/ldo-run.mjs "$RUNTIME/scripts/"
node --check "$RUNTIME/scripts/ldo-run.mjs"

version="$(node -e "console.log(require('$SRC/.claude-plugin/plugin.json').version)" 2>/dev/null || echo unknown)"
printf '%s\n' \
  '# LDO — Codex project install' \
  '' \
  "Installed from LDO v$version." \
  '' \
  'The runtime lives in `.codex/ldo/`; its routing block is delimited in `AGENTS.md`.' \
  'Refresh it by re-running `scripts/install-codex.sh <this-project>` from a newer LDO checkout.' \
  > "$RUNTIME/LDO_INSTALLED.md"

ROUTER="$STAGE/router.md"
printf '%s\n' \
  '<!-- BEGIN ldo-codex -->' \
  '## LDO orchestration' \
  '' \
  'Use LDO for a non-trivial implementation request: a change spanning multiple files, a feature, a refactor, a bug whose cause is not already clear, or anything requiring a review. First tell the user that LDO is starting, then run:' \
  '' \
  '```sh' \
  'node .codex/ldo/scripts/ldo-run.mjs --runtime codex --isolate "<the user request>"' \
  '```' \
  '' \
  'Use `--plan-only` for a request to plan without editing, `--research` when current external facts are required, and omit `--isolate` only when the task must deliberately modify the current working tree. For independent requests, pass each one as a separate `--task` flag.' \
  '' \
  'If the prompt begins with `You are LDO'"'"'s` or says `You are an LDO subagent`, you are already a pipeline worker: do not invoke LDO again. Perform only the assigned role and return the requested JSON.' \
  '' \
  'For a one-file mechanical edit, a direct factual answer, or a request explicitly asking not to orchestrate, work normally without LDO.' \
  '<!-- END ldo-codex -->' \
  > "$ROUTER"

AGENTS="$TARGET/AGENTS.md"
if [ -f "$AGENTS" ] && grep -q '<!-- BEGIN ldo-codex -->' "$AGENTS"; then
  if ! grep -q '<!-- END ldo-codex -->' "$AGENTS"; then
    echo "error: $AGENTS has an unterminated LDO block; repair it before reinstalling" >&2
    exit 1
  fi
  awk '
    /<!-- BEGIN ldo-codex -->/ { skipping=1; next }
    /<!-- END ldo-codex -->/ { skipping=0; next }
    !skipping { print }
  ' "$AGENTS" > "$STAGE/AGENTS.base"
else
  [ -f "$AGENTS" ] && cp "$AGENTS" "$STAGE/AGENTS.base" || : > "$STAGE/AGENTS.base"
fi

cp "$STAGE/AGENTS.base" "$STAGE/AGENTS.md"
if [ -s "$STAGE/AGENTS.md" ]; then printf '\n\n' >> "$STAGE/AGENTS.md"; fi
sed -n 'p' "$ROUTER" >> "$STAGE/AGENTS.md"

# Publish only after all source and AGENTS.md checks have passed. Existing
# LDO-owned files may be replaced; unrelated Codex files and instructions stay.
mkdir -p "$TARGET/.codex/ldo/core" "$TARGET/.codex/ldo/adapters" "$TARGET/.codex/ldo/schemas" "$TARGET/.codex/ldo/agents" "$TARGET/.codex/ldo/scripts"
cp "$RUNTIME"/core/*.mjs "$TARGET/.codex/ldo/core/"
cp "$RUNTIME"/adapters/*.mjs "$TARGET/.codex/ldo/adapters/"
cp "$RUNTIME"/schemas/*.json "$TARGET/.codex/ldo/schemas/"
cp "$RUNTIME"/agents/*.md "$TARGET/.codex/ldo/agents/"
cp "$RUNTIME"/scripts/ldo-run.mjs "$TARGET/.codex/ldo/scripts/"
cp "$RUNTIME/LDO_INSTALLED.md" "$TARGET/.codex/ldo/"
cp "$STAGE/AGENTS.md" "$AGENTS"

echo "Installed LDO into $TARGET/.codex/ldo and updated $AGENTS."
echo "Open Codex in $TARGET; its project instructions will route non-trivial requests through LDO."
