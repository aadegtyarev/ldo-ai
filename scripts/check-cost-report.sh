#!/usr/bin/env bash
# scripts/ldo-cost.py reads harness internals — the per-agent transcripts and
# their meta files — which is the only place the cache figures exist. That makes
# it exactly the kind of tool that goes quietly wrong: a layout change, or a
# renamed usage field, and it reports a smaller number instead of an error.
#
# So the load-bearing assertions here are the negative ones. A run whose usage
# cannot be read must FAIL, loudly, rather than print zeros — reporting $0.00
# for a run that cost real money is worse than reporting nothing, and it is the
# same defect class the `cost` block on the run result was built to avoid.
#
# The fixture under scripts/fixtures/cost-run is two agents with hand-chosen
# round numbers, so every figure below can be recomputed by hand:
#   coder    opus    2,000,000 reads + 100,000 writes + 10 in + 50,000 out
#   reviewer sonnet  1,000,000 reads +       0 writes +  0 in + 10,000 out
#
# Usage: scripts/check-cost-report.sh [ldo-cost.py path]
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COST="${1:-$HERE/ldo-cost.py}"
FIX="$HERE/fixtures/cost-run"
FAILED=0
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass() { printf '✓ %s — %s\n' "$1" "$2"; }
fail() { printf '✗ %s — %s\n' "$1" "$2"; FAILED=1; }

[ -f "$COST" ] || { printf '✗ no ldo-cost.py at %s\n' "$COST"; exit 1; }
[ -d "$FIX" ]  || { printf '✗ no fixture at %s\n' "$FIX"; exit 1; }

# ── the arithmetic ────────────────────────────────────────────────────────
if python3 "$COST" --self-test >/dev/null 2>&1; then
  pass 'the pricing self-test passes' 'exit 0'
else
  fail 'the pricing self-test passes' "$(python3 "$COST" --self-test 2>&1 | grep FAIL | head -2 | tr '\n' ' ')"
fi

OUT="$(python3 "$COST" "$FIX" --json 2>/dev/null)"
if [ -z "$OUT" ]; then
  fail 'the fixture run is readable' 'no JSON returned'
else
  read_tokens=$(printf '%s' "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['totals']['cache_read_input_tokens'])")
  out_tokens=$(printf '%s' "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['totals']['output_tokens'])")
  usd=$(printf '%s' "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['usd'])")
  unc=$(printf '%s' "$OUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['usd_if_uncached'])")

  [ "$read_tokens" = "3000000" ] && pass 'cache reads are summed across agents' "$read_tokens" \
    || fail 'cache reads are summed across agents' "got $read_tokens, expected 3000000"
  [ "$out_tokens" = "60000" ] && pass 'output is summed across agents' "$out_tokens" \
    || fail 'output is summed across agents' "got $out_tokens, expected 60000"
  # opus: 10/1e6*15 + 2e6/1e6*1.5 + 1e5/1e6*18.75 + 5e4/1e6*75 = 8.62515
  # sonnet: 1e6/1e6*0.3 + 1e4/1e6*15 = 0.45   -> 9.08 to the cent
  [ "$usd" = "9.08" ] && pass 'the priced total is the hand-computed figure' "\$$usd" \
    || fail 'the priced total is the hand-computed figure' "got $usd, expected 9.08"
  # uncached: opus (2.1e6+10)/1e6*15 + 3.75 = 35.25015 ; sonnet 1e6/1e6*3 + 0.15 = 3.15
  [ "$unc" = "38.4" ] && pass 'CONTROL: the uncached counterfactual prices reads as fresh input' "\$$unc" \
    || fail 'CONTROL: the uncached counterfactual prices reads as fresh input' "got $unc, expected 38.4"
fi

# ── the part that must never degrade quietly ──────────────────────────────
mkdir -p "$WORK/empty"
if python3 "$COST" "$WORK/empty" >/dev/null 2>&1; then
  fail 'a directory with no transcripts FAILS instead of reporting zero' 'exit 0 — it printed a report for a run it could not read'
else
  pass 'a directory with no transcripts FAILS instead of reporting zero' 'non-zero exit'
fi

mkdir -p "$WORK/noshape"
printf '{"type":"assistant","message":{"role":"assistant","tokens_used":123}}\n' > "$WORK/noshape/agent-x.jsonl"
printf '{"agentType":"ldo:coder","model":"opus"}' > "$WORK/noshape/agent-x.meta.json"
if python3 "$COST" "$WORK/noshape" >/dev/null 2>&1; then
  fail 'transcripts carrying no usage field FAIL instead of reporting zero' 'exit 0 — a renamed usage field would read as a free run'
else
  pass 'transcripts carrying no usage field FAIL instead of reporting zero' 'non-zero exit'
fi

# An unknown model must suppress the total rather than price it as something.
mkdir -p "$WORK/unknown"
cp "$FIX"/agent-aaaa.jsonl "$WORK/unknown/agent-x.jsonl"
printf '{"agentType":"ldo:coder","model":"some-new-model"}' > "$WORK/unknown/agent-x.meta.json"
U="$(python3 "$COST" "$WORK/unknown" --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['usd'])")"
[ "$U" = "None" ] && pass 'an unrecognised model yields no total rather than a guess' 'usd = null' \
  || fail 'an unrecognised model yields no total rather than a guess' "got $U"

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ The cost report reads real usage, and refuses to invent a number it could not read."
else
  echo "✗ Cost report check failed:"
  echo "  Either the arithmetic moved, or the tool stopped noticing that it cannot read a run."
  exit 1
fi
