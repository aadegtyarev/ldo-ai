#!/usr/bin/env python3
"""redact.py — strip secrets and PII from feedback before it leaves the machine.

Feedback about a pipeline run can carry credentials by accident: a token in a
command line, an api_key in an error message, a login in a URL the run hit.
Filing that to a public issue publishes it. This is the deterministic gate:
a conservative pattern list run over the text, replacing every match with a
typed placeholder, so the operator sees *what kind* of thing was removed
without ever re-exposing the value.

Usage:
  scripts/redact.py < input.txt > redacted.txt   # stdin -> stdout
  scripts/redact.py --self-test                    # prove it catches samples

The public entry point is scripts/redact.sh — a thin `exec` wrapper around this
file that leaves stdin alone, so piping into it actually reaches this program.
(The wrapper used to embed this program in a heredoc, which consumed stdin and
silently turned pipe mode into an empty output. The self-test now exercises the
stdin path so that class of defect can't hide behind a green self-test again.)

Over-redaction is the safe direction: a false positive hides a non-secret, a
false negative publishes one. The patterns are ordered specific-first so a
github token is labelled 'github-token', not the generic 'credential'.
"""

import io
import re
import sys

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
    # Anchored to a path boundary: unanchored, this ate the `home`/`Users`
    # segment of any relative path (docs/home/index.md, src/Users/model.ts),
    # which mangles exactly the file references a bug report needs. `/{1,2}`
    # catches file:///home/... and a doubled slash; the Windows shape needs
    # its own rule because the separator is different.
    (r'(?<![\w.-])/{1,2}(?:home|Users)/+[^/\s"\']+', 'home-path'),
    (r'(?i)[A-Z]:\\Users\\[^\\\s"\']+', 'home-path'),
    # Claude's project slug embeds the same home path with dashes for
    # slashes (-home-alice-projects-x), so the rule above never sees it —
    # and every transcriptDir a bug report carries contains one.
    (r'(?<![\w-])-home-[A-Za-z0-9._-]+', 'home-path'),
    (r'\b(?:\d{1,3}\.){3}\d{1,3}\b', 'ip'),
]


def redact(text):
    for pattern, label in PATTERNS:
        text = re.sub(pattern, lambda m: '<REDACTED:%s>' % label, text)
    return text


# The secret-shaped samples are built by concatenation, not written literally:
# GitHub's push protection scans this repo for literal secret shapes and would
# refuse the commit — the exact class of leak redact.py exists to catch. The
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
    ('home path', 'transcriptDir: /home/someuser/x', '<REDACTED:home-path>'),
    ('relative path is not a home path', 'see docs/home/index.md', 'docs/home/index.md'),
    ('windows home path', 'C:\\Users\\bob\\proj', '<REDACTED:home-path>'),
    ('project slug home path', 'dir: /home/bob/.claude/projects/-home-bob-work-app/a', 'projects/<REDACTED:home-path>/a'),
    ('url with login', _s('clone https://user:', 'secretpw@example.com/repo'), '<REDACTED:url-with-credentials>'),
    ('ip address', 'the request came from 192.168.1.10', '<REDACTED:ip>'),
    # negative: ordinary prose must pass through untouched, no false positive.
    ('benign prose', 'the reviewer stalled on a background command', '<REDACTED'),
]


# The production entry point, split out so --self-test can exercise it with a
# fake stdin/stdout instead of the real ones. Reads stdin, fails loudly on empty
# input, writes the redacted text to out. Returns the process exit code.
def redact_stdin(inp, out, err):
    text = inp.read()
    if text == '':
        err.write('redact: no input on stdin — nothing to redact.\n')
        err.write('Pipe text in, e.g. `scripts/redact.sh < report.txt`.\n')
        return 1
    out.write(redact(text))
    return 0


def self_test():
    failures = 0

    def check(name, ok, expected=None, got=None):
        nonlocal failures
        print(('ok  ' if ok else 'FAIL') + '  ' + name)
        if not ok:
            if expected is not None:
                print('      expected: %r' % expected, file=sys.stderr)
                print('      got:      %r' % got, file=sys.stderr)
            failures += 1

    for name, sample, expected in SELF_TEST:
        got = redact(sample)
        if name == 'benign prose':
            check(name, '<REDACTED' not in got)
        else:
            check(name, expected in got, expected, got)

    # The stdin path is the one the skill actually uses, and it's the one that
    # was silently broken before (heredoc consumed stdin). Exercise it directly.
    sample = _s('gh' + 'p_', 'a' * 36) + ' and mail someone@example.com\n'
    out = io.StringIO()
    rc = redact_stdin(io.StringIO(sample), out, io.StringIO())
    produced = out.getvalue()
    ok = rc == 0 and '<REDACTED:github-token>' in produced and '<REDACTED:email>' in produced
    check('stdin path', ok, 'redacted output on stdout', produced)

    # Empty stdin must fail loudly, not emit nothing on exit 0 — silent
    # under-redaction is exactly the failure mode the gate exists to prevent.
    out = io.StringIO()
    err = io.StringIO()
    rc = redact_stdin(io.StringIO(''), out, err)
    ok = rc == 1 and out.getvalue() == '' and 'no input' in err.getvalue()
    check('empty stdin fails loudly', ok, 'exit 1 with a message on stderr', 'rc=%d, out=%r, err=%r' % (rc, out.getvalue(), err.getvalue()))

    return 1 if failures else 0


def main():
    if '--self-test' in sys.argv:
        return self_test()
    return redact_stdin(sys.stdin, sys.stdout, sys.stderr)


if __name__ == '__main__':
    sys.exit(main())
