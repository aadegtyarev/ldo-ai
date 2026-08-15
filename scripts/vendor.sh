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

# Find LDO's own source root: walk up from this script until agents/,
# skills/, and workflows/ldo.js all exist as siblings.
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -f "$SRC/workflows/ldo.js" ] || [ ! -d "$SRC/agents" ] || [ ! -d "$SRC/skills" ]; then
  echo "error: could not find LDO source root above $(dirname "${BASH_SOURCE[0]}") — expected agents/, skills/, workflows/ldo.js as siblings" >&2
  exit 1
fi

if [ "$SRC" = "$TARGET" ]; then
  echo "error: target is the LDO source itself — refusing to vendor LDO into its own repo" >&2
  exit 1
fi

echo "Vendoring LDO from $SRC into $TARGET/.claude/ ..."

mkdir -p "$TARGET/.claude/agents" "$TARGET/.claude/skills" "$TARGET/.claude/workflows"

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
cp "$SRC"/agents/*.md "$TARGET/.claude/agents/"
echo "  agents/*.md -> .claude/agents/ ($(ls "$SRC"/agents/*.md | wc -l | tr -d ' ') files)"
if [ "$collision" = "1" ]; then
  echo "  -> one or more agent names collided with existing files in the target; see warnings above."
fi

# ── 2. Workflow script, transformed — strip the plugin-scope prefix ───────

sed -E "s/agentType: '?ldo:([a-z]+)'?/agentType: '\1'/g" "$SRC/workflows/ldo.js" > "$TARGET/.claude/workflows/ldo.js"

if grep -q "ldo:" "$TARGET/.claude/workflows/ldo.js"; then
  echo "error: transform incomplete — 'ldo:' still present in the vendored workflow script. The source shape changed since this script was written; fix the sed pattern above before vendoring." >&2
  grep -n "ldo:" "$TARGET/.claude/workflows/ldo.js" >&2
  exit 1
fi
echo "  workflows/ldo.js -> .claude/workflows/ldo.js (agentType prefix stripped, verified clean)"

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
  mkdir -p "$TARGET/.claude/skills/$skill_name"
  sed -e 's#/ldo:ldo#/ldo#g' -e 's#name: *"ldo:ldo"#name: "ldo"#g' "$d/SKILL.md" > "$TARGET/.claude/skills/$skill_name/SKILL.md"
  skill_count=$((skill_count + 1))
done
echo "  skills/*/SKILL.md -> .claude/skills/ ($skill_count skills, /ldo:ldo and name:\"ldo:ldo\" -> bare \"ldo\" in each)"

# Verify no plugin-scoped workflow reference survived — same refusal logic as
# the agentType check in step 2. A skill still pointing at /ldo:ldo or
# name:"ldo:ldo" after vendoring would resolve to nothing (vendored runs bare).
if grep -rq 'ldo:ldo' "$TARGET/.claude/skills/"; then
  echo "error: transform incomplete — 'ldo:ldo' still present in vendored skills. The source shape changed since this script was written; fix the sed above before vendoring." >&2
  grep -rn 'ldo:ldo' "$TARGET/.claude/skills/" >&2
  exit 1
fi

# ── 4. Marker file — a vendored copy has no auto-update, say so plainly ───

src_version="$(python3 -c "import json; print(json.load(open('$SRC/.claude-plugin/plugin.json'))['version'])" 2>/dev/null || echo "unknown")"
vendored_at="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")"

cat > "$TARGET/.claude/LDO_VENDORED.md" <<EOF
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
and .claude/workflows are replaced.
EOF
echo "  .claude/LDO_VENDORED.md written (source version: $src_version)"

echo
echo "Done. Next: run /ldo-init in $TARGET to write the CLAUDE.md self-routing block."
