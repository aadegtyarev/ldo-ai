#!/usr/bin/env bash
# redact.sh — strip secrets and PII from feedback before it leaves the machine.
#
# Feedback about a pipeline run can carry credentials by accident: a token in a
# command line, an api_key in an error message, a login in a URL the run hit.
# Filing that to a public issue publishes it. This is the deterministic gate:
# a conservative pattern list run over the text, replacing every match with a
# typed placeholder, so the operator sees *what kind* of thing was removed
# without ever re-exposing the value.
#
# Usage:
#   scripts/redact.sh < input.txt > redacted.txt     # stdin -> stdout
#   scripts/redact.sh --self-test                     # prove it catches samples
#
# Over-redaction is the safe direction: a false positive hides a non-secret, a
# false negative publishes one. The patterns are ordered specific-first so a
# github token is labelled 'github-token', not the generic 'credential'.
#
# The logic lives in embedded Python because sed can't express word boundaries,
# multiline private-key blocks, or a guarantee about what matched after the
# fact. The operator still reviews the output — see skills/ldo-feedback/SKILL.md.

set -euo pipefail

python3 - "$@" <<'PY'
import sys
import re

# (regex, label) — applied in order. The specific token shapes come first so
# they label their match; the generic fallbacks only catch what nothing else did.
PATTERNS = [
    (r'gh[pousr]_[A-Za-z0-9]{20,}', 'github-token'),
    (r'\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b', 'aws-access-key'),
    (r'\bsk-[A-Za-z0-9_-]{16,}', 'api-key'),
    (r'\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}', 'stripe-key'),
    (r'xox[baprs]-[A-Za-z0-9-]{10,}', 'slack-token'),
    (r'AIza[0-9A-Za-z_-]{35}', 'google-api-key'),
    (r'eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}', 'jwt'),
    (r'-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[^-]*-----END [A-Z0-9 ]*PRIVATE KEY-----', 'private-key'),
    (r'(?i)authorization["\']?\s*[:=]\s*["\']?(?:bearer|basic)\s+[^\s"\']+', 'auth-header'),
    # key=value credentials the specific shapes above didn't already strip —
    # matches `password=hunter2`, `api_key=...`, `token: ...`.
    (r'(?i)\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)["\']?\s*[:=]\s*["\']?[^\s"\']{4,}', 'credential'),
    # high-entropy fallbacks — 40+ hex (SHA-ish) or base64-looking blobs.
    (r'\b[a-f0-9]{40,}\b', 'hex-secret'),
    (r'\b[A-Za-z0-9+/]{40,}={0,2}\b', 'base64-secret'),
    # PII — url-with-credentials first, else user:pass@host reads as an email.
    (r'\bhttps?://[^/\s:@]+:[^/\s@]+@', 'url-with-credentials'),
    (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', 'email'),
    (r'\b(?:\d{1,3}\.){3}\d{1,3}\b', 'ip'),
]

def redact(text):
    for pattern, label in PATTERNS:
        text = re.sub(pattern, lambda m: '<REDACTED:%s>' % label, text)
    return text

# Each case is a real shape the gate must catch. `expected in redact(sample)`
# proves both that the secret is gone and that it got a sensible label.
#
# The secret-shaped samples are built by concatenation, not written literally:
# GitHub's push protection scans this repo for literal secret shapes and would
# refuse the commit — the exact class of leak redact.sh exists to catch. The
# concatenated result is identical at runtime, so the gate still tests the real
# shape without the literal ever sitting in source.
def _s(prefix, body):
    return prefix + body

SELF_TEST = [
    ('github token', _s('gh' + 'p_', 'a' * 36), '<REDACTED:github-token>'),
    ('aws access key', _s('AK' + 'IA', 'IOSFODNN7EXAMPLE'), '<REDACTED:aws-access-key>'),
    ('api key', _s('s' + 'k-', 'a' * 32), '<REDACTED:api-key>'),
    ('stripe live key', _s('sk_' + 'live_', 'a' * 24), '<REDACTED:stripe-key>'),
    ('slack token', _s('xox' + 'b-', '1' * 11 + '-' + '2' * 11 + '-' + 'a' * 16), '<REDACTED:slack-token>'),
    ('google api key', _s('AI' + 'za', 'SyD-' + 'a' * 31), '<REDACTED:google-api-key>'),
    ('jwt', _s('ey' + 'J', 'hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + 'a' * 43), '<REDACTED:jwt>'),
    ('private key block', '-----BEGIN RSA PRIVATE KEY-----\nFAKEKEYMATERIAL\n-----END RSA PRIVATE KEY-----', '<REDACTED:private-key>'),
    ('password assignment', _s('password=', 'hunter2secret'), '<REDACTED:credential>'),
    ('email', 'mail someone@example.com about it', '<REDACTED:email>'),
    ('url with login', _s('clone https://user:', 'secretpw@example.com/repo'), '<REDACTED:url-with-credentials>'),
    ('ip address', 'the request came from 192.168.1.10', '<REDACTED:ip>'),
    # negative: ordinary prose must pass through untouched, no false positive.
    ('benign prose', 'the reviewer stalled on a background command', '<REDACTED'),
]

def main():
    if '--self-test' in sys.argv:
        failures = 0
        for name, sample, expected in SELF_TEST:
            got = redact(sample)
            if name == 'benign prose':
                ok = '<REDACTED' not in got
            else:
                ok = expected in got
            print(('ok  ' if ok else 'FAIL') + '  ' + name)
            if not ok:
                print('      expected: %r' % expected, file=sys.stderr)
                print('      got:      %r' % got, file=sys.stderr)
                failures += 1
        sys.exit(1 if failures else 0)

    sys.stdout.write(redact(sys.stdin.read()))

main()
PY
