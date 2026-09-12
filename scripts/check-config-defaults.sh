#!/usr/bin/env bash
# The model-routing table is duplicated across four files and
# check-model-table.sh exists because eyeballing those four copies missed the
# same regression three times. Every OTHER default is duplicated across the same
# four files and nothing checks them: maxFixLoops, maxParallelFeatures,
# planner.maxStepsPerRun, tests.scope, tests.fullSuiteAt, backlog.destination,
# design.map's entry cap, and the six per-role stallMs budgets.
#
# They agree today — checked by hand during /ldo-docs-audit. That is exactly the
# state the model table was in before its third regression, so this is the same
# gate for the same reason: a doc copy that drifts from the source is a value an
# operator sets, believing the number they read.
#
# The source of truth is workflows/ldo.js. Each default is read out of the real
# declaration, never retyped here, and then required to appear in each doc copy.
#
# Usage: scripts/check-config-defaults.sh [repo root]
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SRC="$ROOT/workflows/ldo.js"
FAILED=0

pass() { printf '✓ %s — %s\n' "$1" "$2"; }
fail() { printf '✗ %s — %s\n' "$1" "$2"; FAILED=1; }

[ -f "$SRC" ] || { printf '✗ no workflows/ldo.js under %s\n' "$ROOT"; exit 1; }

# Read a default out of the source rather than restating it.
val() { grep -oE "^const $1 = [^ ]+" "$SRC" | head -1 | sed -E "s/^const $1 = //; s/'//g"; }

# The value must appear ON A LINE THAT ALSO NAMES THE KEY. A bare `grep -F 3`
# matches almost any prose, so a default of 3 drifting to 5 would pass while
# looking checked — the precise failure this gate exists to prevent, one level
# up. `key` is the token a doc uses for the setting; `value` is read from source.
check() {
  local label="$1" key="$2" value="$3"; shift 3
  if [ -z "$value" ]; then
    fail "$label is readable from workflows/ldo.js" "the declaration moved or was renamed — this gate is stale, fix it before trusting a pass"
    return
  fi
  local missing=""
  for f in "$@"; do
    grep -F "$key" "$ROOT/$f" | grep -qF "$value" || missing="$missing $f"
  done
  if [ -z "$missing" ]; then
    pass "$label = $value appears in every doc copy" "$# file(s)"
  else
    fail "$label = $value is missing from a doc copy" "not found in:$missing"
  fi
}

DOCS_ALL="README.md ldo-config.example.json skills/ldo-config/SKILL.md"

check "maxFixLoops"            "maxFixLoops" "$(grep -oE 'CONFIG\.maxFixLoops \|\| [0-9]+' "$SRC" | grep -oE '[0-9]+$')"        $DOCS_ALL
check "maxParallelFeatures"    "maxParallelFeatures" "$(grep -oE 'CONFIG\.maxParallelFeatures \|\| [0-9]+' "$SRC" | grep -oE '[0-9]+$')" $DOCS_ALL
check "maxStepsPerRun"         "maxStepsPerRun" "$(val DEFAULT_MAX_STEPS_PER_RUN)"                                                  $DOCS_ALL
check "tests.scope"            "scope" "$(val DEFAULT_TEST_SCOPE)"                                                         $DOCS_ALL
check "tests.fullSuiteAt"      "fullSuiteAt" "$(val DEFAULT_FULL_SUITE_AT)"                                                      $DOCS_ALL
check "backlog.destination"    "destination" "$(val DEFAULT_BACKLOG_DESTINATION)"                                                $DOCS_ALL
check "design.map entry cap"   "entries" "$(val DESIGN_MAP_MAX)"                                                             README.md skills/ldo-config/SKILL.md

# stallMs is one object, six numbers. Each is checked separately: a single
# "the block matches" assertion would say nothing about which role drifted.
STALL_LINE="$(grep -E '^const DEFAULT_STALL_MS = ' "$SRC")"
if [ -z "$STALL_LINE" ]; then
  fail 'DEFAULT_STALL_MS is readable' 'declaration moved or renamed — this gate is stale'
else
  for role in planner reviewer coder security researcher recorder; do
    ms="$(printf '%s' "$STALL_LINE" | grep -oE "$role: [0-9]+" | grep -oE '[0-9]+')"
    check "stallMs.$role" "$role" "$ms" README.md ldo-config.example.json skills/ldo-config/SKILL.md
  done
fi

# The routing PROSE, not the table. check-model-table.sh holds the four machine
# copies to the source; the sentence an operator actually reads every session —
# "Models route automatically: ..." in the block /ldo-init writes — was not held
# to anything, and drifted a whole release behind the table it describes while
# every other check stayed green. A project running /ldo-init then gets a
# description that contradicts what it installs.
ROUTING_FILES="skills/ldo-init/SKILL.md CLAUDE.md"
ALL_MODELS="opus sonnet haiku fable"
IN_TABLE="$(printf '%s' "$STALL_LINE" >/dev/null; grep -A4 '^const DEFAULT_MODELS' "$SRC" | grep -oE "'(opus|sonnet|haiku|fable)'" | tr -d "'" | sort -u)"

for f in $ROUTING_FILES; do
  [ -f "$ROOT/$f" ] || continue
  para="$(grep -A3 'Models route automatically' "$ROOT/$f" || true)"
  if [ -z "$para" ]; then
    fail "$f names the routing in prose" 'the "Models route automatically" sentence is gone — this gate is stale, or the block is'
    continue
  fi
  bad=""
  for m in $ALL_MODELS; do
    named=0; printf '%s' "$para" | grep -qiF "$m" && named=1
    listed=0; printf '%s\n' "$IN_TABLE" | grep -qxF "$m" && listed=1
    [ "$named" != "$listed" ] && bad="$bad $m(prose=$named,table=$listed)"
  done
  if [ -z "$bad" ]; then
    pass "$f's routing sentence names exactly the models the table routes" "$(printf '%s' "$IN_TABLE" | tr '\n' ' ')"
  else
    fail "$f's routing sentence disagrees with DEFAULT_MODELS" "mismatched:$bad"
  fi
done

# LDO's own CLAUDE.md is the first consumer of the block /ldo-init writes, and
# in this repo it must not lag behind it. The surface-governance change edited
# only this copy and left the canonical block in the skill a release behind, so
# every project running /ldo-init would have installed the older wording, and
# nothing here noticed. The drift-log lines are the project's own data, never
# LDO's, so they are excluded from the comparison.
BLOCK_DRIFT="$(python3 - "$ROOT" <<'BLOCKPY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])

def block(path):
    lines = (root / path).read_text().split('\n')
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == '<!-- BEGIN ldo -->')
        end = next(i for i, l in enumerate(lines) if l.strip() == '<!-- END ldo -->')
    except StopIteration:
        return None
    kept, skipping = [], False
    for line in lines[start:end + 1]:
        if line.strip() == '<!-- ldo:features -->':
            skipping = True
        elif line.strip() == '<!-- /ldo:features -->':
            skipping = False
        elif not skipping:
            kept.append(line)
    return kept

canonical = block('skills/ldo-init/SKILL.md')
installed = block('CLAUDE.md')
if canonical is None or installed is None:
    print('a block marker is missing — this gate is stale, or one of the files is')
elif canonical != installed:
    first = next((f'line {i + 1}: skill {c!r} vs CLAUDE.md {p!r}'
                  for i, (c, p) in enumerate(zip(canonical, installed)) if c != p),
                 f'{len(canonical)} block lines vs {len(installed)}')
    print(first[:240])
BLOCKPY
)"
if [ -z "$BLOCK_DRIFT" ]; then
  pass "this repo's CLAUDE.md block matches the one /ldo-init writes" 'identical apart from the drift log'
else
  fail "this repo's CLAUDE.md block has drifted from skills/ldo-init/SKILL.md" "$BLOCK_DRIFT"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ Every documented default still matches workflows/ldo.js."
else
  echo "✗ Config default drift found (source of truth: workflows/ldo.js):"
  echo "  A doc copy states a default the code does not. An operator reads the doc."
  exit 1
fi
