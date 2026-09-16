#!/usr/bin/env bash
# Vendor LDO into a project's .claude/ directory — no plugin, no marketplace,
# no install step. See skills/ldo-vendor/SKILL.md for the why; this is the
# how, as a deterministic script rather than instructions a model re-derives
# and re-runs by hand each time. A script either works or fails loudly; text
# instructions can be followed slightly wrong and fail silently instead.
#
# Usage: scripts/vendor.sh <target-project-dir>
#   Run from anywhere inside an LDO checkout (this script finds the repo
#   root itself). <target-project-dir> must already exist.

set -euo pipefail

TARGET="${1:?Usage: scripts/vendor.sh <target-project-dir>}"

if [ ! -d "$TARGET" ]; then
  echo "error: target directory does not exist: $TARGET" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"

# Find LDO's own source root: walk up from this script until the Claude
# plugin inputs and the runtime-neutral core all exist as siblings.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "$SRC/workflows/ldo.js" ] || [ ! -d "$SRC/agents" ] || [ ! -d "$SRC/skills" ] || [ ! -d "$SRC/core" ] || [ ! -d "$SRC/adapters" ] || [ ! -d "$SRC/schemas" ]; then
  echo "error: could not find LDO source root above $(dirname "${BASH_SOURCE[0]}") — expected agents/, skills/, workflows/ldo.js, core/, adapters/, schemas/ as siblings" >&2
  exit 1
fi

if [ "$SRC" = "$TARGET" ]; then
  echo "error: target is the LDO source itself — refusing to vendor LDO into its own repo" >&2
  exit 1
fi

echo "Vendoring LDO from $SRC into $TARGET/.claude/ ..."

# Everything is built in a staging directory and only published into $TARGET
# once every guard below has passed. It used to write straight into the target
# and check afterwards, so a failed guard left a HALF-VENDORED install — agents
# and a workflow present, skills and the marker file missing — while printing
# only "transform incomplete". That is the shape a reader trusts least: an
# error message about the source, next to a target that now looks populated.
# README's own sentence ("verifies the result, refusing to proceed if anything
# is left half-transformed") is only true with the staging step in place.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/agents" "$STAGE/skills" "$STAGE/workflows" "$STAGE/core" "$STAGE/adapters" "$STAGE/schemas" "$STAGE/scripts"

# ── 1. Agents, verbatim — frontmatter names are already bare ──────────────

# Collision check: warn (don't block — the operator may want to override
# deliberately) if a target agent file already exists with a name LDO uses.
collision=0
for f in "$SRC"/agents/*.md; do
  name="$(basename "$f")"
  if [ -f "$TARGET/.claude/agents/$name" ]; then
    echo "warning: $TARGET/.claude/agents/$name already exists — Claude Code resolves duplicate bare agent names by filesystem read order, silently, no error. Overwriting." >&2
    collision=1
  fi
done
cp "$SRC"/agents/*.md "$STAGE/agents/"
echo "  agents/*.md -> .claude/agents/ ($(ls "$SRC"/agents/*.md | wc -l | tr -d ' ') files)"
if [ "$collision" = "1" ]; then
  echo "  -> one or more agent names collided with existing files in the target; see warnings above."
fi

# ── 2. Workflow script, transformed — strip the plugin-scope prefix ───────

# Two transforms, not one. The agentType prefix is the load-bearing one — a
# vendored run resolves `ldo:planner` to nothing. The second is the workflow
# NAME in the log lines that tell an operator how to launch or resume a run:
# a vendored install runs bare `ldo`, so a message saying
# `Workflow({name:"ldo:ldo", ...})` hands the operator a name that does not
# resolve, at exactly the moment they are trying to recover a dead run. The
# skills get the same treatment in step 3.
sed -E -e "s/agentType: '?ldo:([a-z]+)'?/agentType: '\1'/g" -e 's/name:"ldo:ldo"/name:"ldo"/g' "$SRC/workflows/ldo.js" > "$STAGE/workflows/ldo.js"

# Still a broad `ldo:` search rather than one narrowed to `agentType: 'ldo:`,
# because the broad one is what has twice caught a shape nobody had thought
# about. But broad-and-unqualified cried wolf twice on prose that was correct
# both times, and a tool that fails on every successful run trains its operator
# to stop reading the exit code. So: search broadly, then subtract the forms
# already adjudicated as safe. A genuinely new shape still trips it; a mention
# this project has already reasoned about does not.
#
# VENDOR_SAFE_LDO is that allowlist, and adding to it is meant to be a
# deliberate act with a reason attached — not a regex loosened in passing.
#   ldo:version — the `<!-- ldo:version -->` marker /ldo-init stamps into a
#   project's CLAUDE.md. Vendored installs run /ldo-init too, so the comment
#   describing it is as true in a vendored copy as it is here.
VENDOR_SAFE_LDO='ldo:version'
residual="$(grep -n "ldo:" "$STAGE/workflows/ldo.js" | grep -Ev "$VENDOR_SAFE_LDO" || true)"
if [ -n "$residual" ]; then
  echo "error: transform incomplete — an unrecognised 'ldo:' survived in the vendored workflow script. Either the source shape changed and the sed above needs updating, or this is a new prose mention that belongs in VENDOR_SAFE_LDO with a reason." >&2
  printf '%s\n' "$residual" >&2
  exit 1
fi
echo "  workflows/ldo.js -> .claude/workflows/ldo.js (agentType prefix and ldo:ldo workflow name stripped, verified clean)"

# ── 3. Skills, with slash-command references updated ──────────────────────

skill_count=0
for d in "$SRC"/skills/*/; do
  skill_name="$(basename "$d")"
  # Don't vendor ldo-vendor itself into a project — that's circular unless
  # the target project is meant to re-vendor LDO into other projects, which
  # is unusual enough to require an explicit opt-in rather than happening by
  # default on every vendor run.
  if [ "$skill_name" = "ldo-vendor" ]; then
    continue
  fi
  mkdir -p "$STAGE/skills/$skill_name"
  sed -e 's#/ldo:ldo#/ldo#g' -e 's#name: *"ldo:ldo"#name: "ldo"#g' "$d/SKILL.md" > "$STAGE/skills/$skill_name/SKILL.md"
  skill_count=$((skill_count + 1))
done
echo "  skills/*/SKILL.md -> .claude/skills/ ($skill_count skills, /ldo:ldo and name:\"ldo:ldo\" -> bare \"ldo\" in each)"

# Verify no plugin-scoped workflow reference survived — same refusal logic as
# the agentType check in step 2. A skill still pointing at /ldo:ldo or
# name:"ldo:ldo" after vendoring would resolve to nothing (vendored runs bare).
if grep -rq 'ldo:ldo' "$STAGE/skills/"; then
  echo "error: transform incomplete — 'ldo:ldo' still present in vendored skills. The source shape changed since this script was written; fix the sed above before vendoring." >&2
  grep -rn 'ldo:ldo' "$STAGE/skills/" >&2
  exit 1
fi

# ── 4. Shared runtime — available to both Claude Code and Codex ───────────

# Keep the standalone runner beside vendored agents. Its relative imports are
# intentional: .claude/scripts/ldo-run.mjs resolves ../core, ../adapters and
# ../schemas inside this same project-native install.
cp "$SRC"/core/*.mjs "$STAGE/core/"
cp "$SRC"/adapters/*.mjs "$STAGE/adapters/"
cp "$SRC"/schemas/*.json "$STAGE/schemas/"
cp "$SRC"/scripts/ldo-run.mjs "$SRC"/scripts/check-core.sh "$STAGE/scripts/"
node --check "$STAGE/scripts/ldo-run.mjs"
node --check "$STAGE/core/agent-runner.mjs"
node --check "$STAGE/core/pipeline.mjs"
echo "  core/, adapters/, schemas/, scripts/ldo-run.mjs -> .claude/ (shared Claude/Codex runtime)"

# ── 5. Marker file — a vendored copy has no auto-update, say so plainly ───

src_version="$(python3 -c "import json; print(json.load(open('$SRC/.claude-plugin/plugin.json'))['version'])" 2>/dev/null || echo "unknown")"
vendored_at="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")"

cat > "$STAGE/LDO_VENDORED.md" <<EOF
# LDO — vendored copy

Vendored from LDO v${src_version} on ${vendored_at}.

This is a project-native install, not a plugin — no \`/plugin update\` applies
to it. There is no background check pulling in newer versions; that would
mean phoning home from inside a project's own dev pipeline, and this
deliberately doesn't do that.

To refresh: re-run \`scripts/vendor.sh\` from a current LDO checkout, pointed
at this project. Check LDO's own CHANGELOG.md for what changed since
v${src_version} before overwriting — a vendored copy already customized for
this project (routing in CLAUDE.md, project contracts) isn't touched by
vendoring; only the LDO-owned files under .claude/agents, .claude/skills,
.claude/workflows, .claude/core, .claude/adapters, .claude/schemas and
.claude/scripts are replaced.
EOF
echo "  .claude/LDO_VENDORED.md written (source version: $src_version)"

# ── 6. Publish — the first and only writes into $TARGET ───────────────────
#
# Everything above ran against $STAGE, so a guard that fired left the target
# exactly as it was. From here the copies are mechanical: nothing below can
# decide to stop, which is the property that makes "verified before written"
# true rather than aspirational.
mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/skills" "$TARGET/.claude/workflows" "$TARGET/.claude/core" "$TARGET/.claude/adapters" "$TARGET/.claude/schemas" "$TARGET/.claude/scripts"
cp "$STAGE"/agents/*.md "$TARGET/.claude/agents/"
cp "$STAGE"/workflows/ldo.js "$TARGET/.claude/workflows/ldo.js"
cp -R "$STAGE"/skills/. "$TARGET/.claude/skills/"
cp "$STAGE"/core/*.mjs "$TARGET/.claude/core/"
cp "$STAGE"/adapters/*.mjs "$TARGET/.claude/adapters/"
cp "$STAGE"/schemas/*.json "$TARGET/.claude/schemas/"
cp "$STAGE"/scripts/* "$TARGET/.claude/scripts/"
cp "$STAGE"/LDO_VENDORED.md "$TARGET/.claude/LDO_VENDORED.md"

echo
echo "Done. Next: run /ldo-init in $TARGET to write the CLAUDE.md self-routing block."
