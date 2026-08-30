#!/usr/bin/env bash
# The redaction gate has failed twice in the same way, and both times a green
# --self-test licensed it. Issue #2: the wrapper embedded the program in a
# `python3 - <<'PY'` heredoc, so python read its source from stdin and
# `sys.stdin.read()` returned '' — pipe mode emitted nothing while --self-test,
# which never touches stdin, reported all cases ok. Issue #13 re-raised it after
# the fix, from a copy three versions old.
#
# redact.py's own --self-test now drives redact_stdin with a fake stdin, which
# is necessary and not sufficient: an in-process test of the Python program
# cannot see the WRAPPER. Re-adding a heredoc to redact.sh would break the
# documented `redact.sh < input.txt` again and leave that self-test green.
#
# So this drives the real entry point through a real pipe — `scripts/redact.sh`,
# the exact command skills/ldo-feedback tells the operator to run — and asserts
# on what came out of it. Nothing here imports, sources or copies the program:
# if the wrapper stops passing stdin through, every assertion below fails.
#
# Usage: scripts/check-redact.sh [redact.sh path]
set -uo pipefail

REDACT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/redact.sh}"
FAILED=0

pass() { printf '✓ %s — %s\n' "$1" "$2"; }
fail() { printf '✗ %s — %s\n' "$1" "$2"; FAILED=1; }

if [ ! -f "$REDACT" ]; then
  printf '✗ %s\n' "no redact.sh at $REDACT — the gate the feedback skill depends on is not installed"
  exit 1
fi

# 1. A secret on stdin comes back redacted, and the output is NOT empty. Empty
#    output is the exact shape of both past failures: fail-safe for leaks,
#    useless as a gate, and indistinguishable from "nothing sensitive here".
OUT=$(printf 'tok ghp_0123456789abcdef0123456789abcdef01234567\n' | "$REDACT" 2>/dev/null)
if [ -z "$OUT" ]; then
  fail 'a secret piped in comes back redacted' 'empty output — the wrapper is eating stdin again (issues #2, #13)'
elif printf '%s' "$OUT" | grep -q 'ghp_0123456789abcdef0123456789abcdef01234567'; then
  fail 'a secret piped in comes back redacted' "the token survived: $OUT"
elif ! printf '%s' "$OUT" | grep -q 'REDACTED'; then
  fail 'a secret piped in comes back redacted' "no REDACTED marker in: $OUT"
else
  pass 'a secret piped in comes back redacted' "$OUT"
fi

# 2. The benign control. Without it, a filter that emits a fixed string — or
#    that redacts everything — passes assertion 1 and destroys every report.
BENIGN='plain prose with no secret in it'
OUT=$(printf '%s\n' "$BENIGN" | "$REDACT" 2>/dev/null)
if [ "$OUT" = "$BENIGN" ]; then
  pass 'CONTROL: benign prose passes through unchanged and non-empty' "$OUT"
else
  fail 'CONTROL: benign prose passes through unchanged and non-empty' "expected '$BENIGN', got '$OUT'"
fi

# 3. Multi-line input survives as multiple lines. The feedback body is a
#    multi-KB markdown document; a gate that collapses it to one line would
#    still pass assertions 1 and 2.
LINES=$(printf 'line one\nline two\nline three\n' | "$REDACT" 2>/dev/null | wc -l)
if [ "$LINES" = "3" ]; then
  pass 'a multi-line body keeps its lines' '3 line(s) in, 3 out'
else
  fail 'a multi-line body keeps its lines' "3 line(s) in, $LINES out"
fi

# 4. Redaction is idempotent. skills/ldo-feedback proves the file it is about to
#    publish came from the gate by re-running the gate over it and diffing, and
#    that check is only meaningful if a second pass is a no-op.
ONCE=$(printf 'tok ghp_0123456789abcdef0123456789abcdef01234567 and a@b.com\n' | "$REDACT" 2>/dev/null)
TWICE=$(printf '%s\n' "$ONCE" | "$REDACT" 2>/dev/null)
if [ -z "$ONCE" ] || [ -z "$TWICE" ]; then
  # Two empty strings are equal. Without this, the broken-wrapper case — where
  # every pass emits nothing — satisfies idempotence vacuously and this
  # assertion goes green beside three red ones.
  fail 'CONTROL: redaction is idempotent, so the pre-publish proof holds' 'one of the two passes emitted nothing — idempotence over empty output proves nothing'
elif [ "$ONCE" = "$TWICE" ]; then
  pass 'CONTROL: redaction is idempotent, so the pre-publish proof holds' "$ONCE"
else
  fail 'CONTROL: redaction is idempotent, so the pre-publish proof holds' "first: '$ONCE' / second: '$TWICE'"
fi

# 5. The self-test still passes — kept last so a failure here reads as "and the
#    self-test too", never as the only thing that was checked.
if "$REDACT" --self-test >/dev/null 2>&1; then
  pass 'the self-test still passes' 'exit 0'
else
  fail 'the self-test still passes' 'non-zero exit'
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ The redaction gate actually redacts when piped to ($REDACT)."
else
  echo "✗ Redaction gate check failed:"
  echo "  The gate the /ldo-feedback skill depends on does not do its job through a pipe."
  exit 1
fi
