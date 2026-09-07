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

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ Every documented default still matches workflows/ldo.js."
else
  echo "✗ Config default drift found (source of truth: workflows/ldo.js):"
  echo "  A doc copy states a default the code does not. An operator reads the doc."
  exit 1
fi
