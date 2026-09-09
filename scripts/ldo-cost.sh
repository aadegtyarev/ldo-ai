#!/usr/bin/env bash
# Thin wrapper around scripts/ldo-cost.py, kept for the same reason
# scripts/redact.sh is: the program lives in its own file so nothing consumes
# stdin, and callers get one stable path regardless of which interpreter is
# involved.
#
#   scripts/ldo-cost.sh <transcript-dir>        what the run cost, cache included
#   scripts/ldo-cost.sh <transcript-dir> --json machine-readable
#   scripts/ldo-cost.sh --self-test             prove the arithmetic
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/ldo-cost.py" "$@"
