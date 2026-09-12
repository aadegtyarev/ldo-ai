#!/usr/bin/env bash
# Install LDO as project-local Codex runtime and enable its AGENTS.md router.
#
# Usage: scripts/install-codex.sh [--ignore-codex] <target-project-dir>
#
# The copied runtime is deliberately project-local. It makes the routing rule
# reproducible for everyone who opens the target with Codex, without requiring
# a global package install or changing the user's Codex configuration.

set -euo pipefail

IGNORE_CODEX=false
if [ "${1:-}" = "--ignore-codex" ]; then
  IGNORE_CODEX=true
  shift
fi
TARGET="${1:?Usage: scripts/install-codex.sh [--ignore-codex] <target-project-dir>}"
if [ "$#" != 1 ]; then
  echo "error: expected one target directory" >&2
  exit 1
fi

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
  'For a non-trivial implementation request, let LDO plan first and decide whether review is needed. First tell the user that LDO is starting, then run:' \
  '' \
  '```sh' \
  'node .codex/ldo/scripts/ldo-run.mjs --runtime codex "<the user request>"' \
  '```' \
  '' \
  'LDO saves every plan locally. In `review-plan=auto` (default), it pauses for discussion only when Planner rates the task `complex` or `elevated`; use `--review-plan always` or `never` to override. When paused, show the plan and wait for explicit approval; then run `node .codex/ldo/scripts/ldo-run.mjs --runtime codex --continue-plan latest`. If a pipeline later crashes, run `node .codex/ldo/scripts/ldo-run.mjs --runtime codex --resume-run latest` to continue from its first incomplete phase. If the user changes scope, create a new plan-only artifact instead. Use `--research` when current external facts are required and `--no-record` for fast, disposable iterations. Do not add `--isolate` in a normal `workspace-write` Codex session: Git worktree creation writes shared `.git/refs`, which that sandbox may forbid. Use `--isolate` only when the host explicitly permits Git metadata writes (for example, an externally sandboxed bypass session). Run independent tasks sequentially in the normal Codex path.' \
  'Planner runs once on Sol; do not add a preliminary classifier or second refinement pass. Trivial Reviewers use a compact verification prompt. These policies are Codex-only.' \
  '' \
  'After every completed pipeline, always print a concise operator report in normal prose; raw pipeline JSON is not the report. Include the task outcome and verdict, changed files, tests, unresolved issues, token totals and per-stage usage, `runCheckpoint` path, and Recorder'"'"'s `backlog.destination`, `backlog.file`, and `backlog.count`. The Recorder must update `docs/BACKLOG.md` when unresolved items exist. Never silently finish without the operator report or without confirming the terminal checkpoint and backlog outcome. A deliberate `--no-record` run or a trivial run may report that backlog recording was skipped.' \
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

if [ "$IGNORE_CODEX" = true ]; then
  # Codex runtime is a per-developer install: avoid a noisy untracked tree and
  # avoid asking teams using Claude Code to carry another agent's files. The
  # project-level AGENTS.md routing block remains separate and is deliberately
  # left visible for the project's own instruction policy.
  IGNORE="$TARGET/.gitignore"
  if [ ! -f "$IGNORE" ] || ! grep -Fxq '.codex/' "$IGNORE"; then
    if [ -f "$IGNORE" ] && [ -s "$IGNORE" ]; then printf '\n' >> "$IGNORE"; fi
    printf '%s\n' '.codex/' >> "$IGNORE"
  fi
fi

echo "Installed LDO into $TARGET/.codex/ldo and updated $AGENTS."
if [ "$IGNORE_CODEX" = true ]; then
  echo "Added .codex/ to $TARGET/.gitignore; each developer installs this runtime locally."
fi
echo "Open Codex in $TARGET; its project instructions will route non-trivial requests through LDO."
