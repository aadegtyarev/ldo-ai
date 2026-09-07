#!/usr/bin/env bash
# vendor.sh is the only script under scripts/ that had no gate, and it broke
# twice for the same reason: a `ldo:` string appeared somewhere nobody had
# thought about, the post-transform guard fired, and the run exited 1. The
# second time it also left the target HALF-VENDORED — agents and a workflow
# written, skills and the marker file missing — because the guard ran after the
# writes. Both times the failure looked like a source problem and was reported
# as one.
#
# So this drives the real script into a throwaway directory and asserts what a
# reader is entitled to assume: a clean source vendors completely and exits 0,
# and a source the guard rejects leaves the target EXACTLY as it was. The second
# is the load-bearing one — it is the property the README claims and the one
# that was false.
#
# Usage: scripts/check-vendor.sh [vendor.sh path]
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR="${1:-$HERE/vendor.sh}"
ROOT="$(cd "$HERE/.." && pwd)"
FAILED=0
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass() { printf '✓ %s — %s\n' "$1" "$2"; }
fail() { printf '✗ %s — %s\n' "$1" "$2"; FAILED=1; }

[ -f "$VENDOR" ] || { printf '✗ no vendor.sh at %s\n' "$VENDOR"; exit 1; }

# ── 1. A clean source vendors completely, exit 0 ──────────────────────────
T1="$WORK/clean"
mkdir -p "$T1"
out1="$(bash "$VENDOR" "$T1" 2>&1)"; rc1=$?
if [ "$rc1" != "0" ]; then
  fail 'a clean source vendors and exits 0' "exit $rc1: $(printf '%s' "$out1" | tail -2 | tr '\n' ' ')"
else
  pass 'a clean source vendors and exits 0' 'exit 0'
fi

for want in agents workflows/ldo.js skills LDO_VENDORED.md; do
  if [ -e "$T1/.claude/$want" ]; then
    pass "a completed vendor writes .claude/$want" 'present'
  else
    fail "a completed vendor writes .claude/$want" 'missing — the run stopped part-way'
  fi
done

# The load-bearing transform: an agentType the harness cannot resolve is what
# makes a vendored run fail at its first agent call, silently, per-agent.
if [ -f "$T1/.claude/workflows/ldo.js" ]; then
  left=$(grep -c "agentType: 'ldo:" "$T1/.claude/workflows/ldo.js" || true)
  if [ "$left" = "0" ]; then
    pass 'no plugin-scoped agentType survives the transform' '0 remaining'
  else
    fail 'no plugin-scoped agentType survives the transform' "$left remaining"
  fi
  n=$(grep -c "agentType: '" "$T1/.claude/workflows/ldo.js" || true)
  if [ "$n" -ge 7 ]; then
    pass 'CONTROL: the agentTypes are still there, just unprefixed' "$n bare agentType reference(s)"
  else
    fail 'CONTROL: the agentTypes are still there, just unprefixed' "only $n — the sed ate more than the prefix"
  fi
fi

# ── 2. A rejected source leaves the target untouched ──────────────────────
# The guard has to fire on something it genuinely does not recognise, so this
# builds a source copy carrying an agentType shape the sed cannot match.
SRCCOPY="$WORK/src"
mkdir -p "$SRCCOPY"
cp -R "$ROOT/agents" "$ROOT/skills" "$ROOT/workflows" "$ROOT/scripts" "$ROOT/.claude-plugin" "$SRCCOPY/" 2>/dev/null
printf '\n// agentType: "ldo:NEWSHAPE"\n' >> "$SRCCOPY/workflows/ldo.js"

T2="$WORK/rejected"
mkdir -p "$T2"
out2="$(bash "$SRCCOPY/scripts/vendor.sh" "$T2" 2>&1)"; rc2=$?
if [ "$rc2" != "0" ]; then
  pass 'an unrecognised ldo: shape is rejected' "exit $rc2"
else
  fail 'an unrecognised ldo: shape is rejected' 'exit 0 — the guard did not fire on a shape the sed cannot match'
fi

# THE assertion. Everything else here is hygiene; this is the regression.
leftovers="$(find "$T2" -mindepth 1 2>/dev/null | head -5)"
if [ -z "$leftovers" ]; then
  pass 'a rejected vendor leaves the target EXACTLY as it was' 'nothing written'
else
  fail 'a rejected vendor leaves the target EXACTLY as it was' "half-vendored: $(printf '%s' "$leftovers" | tr '\n' ' ')"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ Vendoring is complete-or-nothing ($VENDOR)."
else
  echo "✗ Vendor check failed:"
  echo "  A vendor run either half-wrote its target or stopped reporting a bad source."
  exit 1
fi
