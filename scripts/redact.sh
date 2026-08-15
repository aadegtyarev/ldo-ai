#!/usr/bin/env bash
# redact.sh — strip secrets and PII from feedback before it leaves the machine.
#
# This is a thin wrapper around scripts/redact.py. The program used to be
# embedded here as a `python3 - <<'PY'` heredoc, but that consumed stdin, so the
# documented pipe mode (`redact.sh < input.txt`) silently wrote nothing while
# `--self-test` still passed — the gate reported success while doing no work.
# Keeping the program in its own file and `exec`ing it leaves stdin alone.
#
# Usage:
#   scripts/redact.sh < input.txt > redacted.txt     # stdin -> stdout
#   scripts/redact.sh --self-test                     # prove it catches samples
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/redact.py" "$@"
