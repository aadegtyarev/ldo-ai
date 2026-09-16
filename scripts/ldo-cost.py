#!/usr/bin/env python3
"""Report what a pipeline run actually cost, cache included.

The `cost` block on a run result reports OUTPUT tokens only, and says so in its
own note — the workflow script is handed `budget.spent()` and nothing else, so
from inside a run the cache figures are not reachable. That note is honest and
it is also the problem: on one measured 9-agent run the output was 588k tokens
against 22.5 million cache reads — output is 54% of that bill and the reads 33%,
so the figure the pipeline surfaces is a real share of the total but not a
proxy for it, and the two move apart as a run's re-reading grows (issue #31).

The numbers do exist, in the per-agent transcripts the harness writes. This
reads them back: `agent-*.jsonl` for `usage`, `agent-*.meta.json` for the role
and model, and reports per role and in total.

One usage record is NOT one turn: a streamed answer is written repeatedly under
one `message.id`, so the records must be folded per message before anything is
summed. See `read_agent` — getting this wrong overstated every run by about 2x,
which is the kind of error that reads as a plausible bill.

Two things it deliberately does NOT do:

- It never prints a zero for something it could not read. Transcript layout is
  harness internals and may change between builds; a run whose usage records
  cannot be found is reported as unreadable, loudly, because a cost report that
  quietly says 0 is worse than no cost report at all.
- It does not pretend the prices are authoritative. They are list prices as of
  writing, stated as an assumption and overridable with --price. Confirm them
  against your own billing before quoting a number to anyone.

Usage:
  scripts/ldo-cost.py <transcript-dir>          # one run
  scripts/ldo-cost.py <transcript-dir> --json   # machine-readable
  scripts/ldo-cost.py --self-test               # prove the arithmetic
  scripts/ldo-cost.py <dir> --price opus=15/75 --price sonnet=3/15
"""
import json
import os
import sys
import glob

# Dollars per million tokens: (input, output). List prices at the time of
# writing — an assumption, not a fact this script can verify. Override with
# --price <model>=<in>/<out>.
PRICES = {
    'opus':   (15.0, 75.0),
    'sonnet':  (3.0, 15.0),
    'haiku':   (1.0,  5.0),
    'fable':  (15.0, 75.0),
}
# Cache reads are billed at a fraction of the input rate, cache writes at a
# premium over it. Same status as the table above: assumptions, stated here so
# they can be corrected in one place rather than hidden in arithmetic.
CACHE_READ_MULT = 0.10
CACHE_WRITE_MULT = 1.25

FIELDS = ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens')


def read_agent(jsonl_path):
    """Sum usage over every assistant message in one agent transcript.

    A streamed response is written to the transcript more than once: the same
    `message.id` reappears as the answer grows, carrying IDENTICAL input and
    cache figures and a rising `output_tokens`. Summing the records instead of
    the messages therefore bills the prompt once per partial. Measured over 402
    agent transcripts (19,381 messages, 40,114 records) that is a 2.07x
    overstatement; on one 9-agent run it reported $114.16 for a run that cost
    $72.95.

    So usage is folded per `message.id` — input and cache fields are the same
    in every partial, and `output_tokens` is taken at its maximum, which is the
    final value because the sequence only grows. Both invariants were checked
    across those 19,381 messages: zero had input or cache fields that varied
    between partials, and zero had a non-monotonic output count.

    A record with no `message.id` is counted on its own, so that one record is
    one message when the id is absent; collapsing them together would
    under-count instead. That branch is defensive, not observed: every one of
    the 574 transcripts on disk carries an id on every usage record, the oldest
    included, so nothing here proves an id-less transcript ever existed. The
    fixtures are the only thing shaped that way, and check-cost-report.sh holds
    the branch open with them.
    """
    per_message = {}
    order = []
    anonymous = 0
    with open(jsonl_path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            message = rec.get('message') or {}
            usage = message.get('usage') or rec.get('usage')
            if not isinstance(usage, dict):
                continue
            fields = {f: usage[f] for f in FIELDS if isinstance(usage.get(f), int)}
            if not fields:
                continue
            mid = message.get('id')
            if not isinstance(mid, str) or not mid:
                anonymous += 1
                key = ('#anon', anonymous)
            else:
                key = ('#id', mid)
            if key not in per_message:
                per_message[key] = dict.fromkeys(FIELDS, 0)
                order.append(key)
            slot = per_message[key]
            for f, v in fields.items():
                # Identical across partials for the input/cache fields; rising
                # for output. max() is right for both, and never double-counts.
                if v > slot[f]:
                    slot[f] = v

    totals = dict.fromkeys(FIELDS, 0)
    for key in order:
        for f in FIELDS:
            totals[f] += per_message[key][f]
    return totals, len(order)


def price_of(model, t):
    """Dollars for one agent's usage. Unknown model -> None, never a guess."""
    rate = PRICES.get((model or '').lower())
    if rate is None:
        return None
    inp, out = rate
    return (
        t['input_tokens'] / 1e6 * inp
        + t['cache_read_input_tokens'] / 1e6 * inp * CACHE_READ_MULT
        + t['cache_creation_input_tokens'] / 1e6 * inp * CACHE_WRITE_MULT
        + t['output_tokens'] / 1e6 * out
    )


def uncached_price_of(model, t):
    """What the same work would have cost with every read paid as fresh input."""
    rate = PRICES.get((model or '').lower())
    if rate is None:
        return None
    inp, out = rate
    every_input = t['input_tokens'] + t['cache_read_input_tokens'] + t['cache_creation_input_tokens']
    return every_input / 1e6 * inp + t['output_tokens'] / 1e6 * out


def collect(run_dir):
    agents = []
    for jsonl_path in sorted(glob.glob(os.path.join(run_dir, 'agent-*.jsonl'))):
        meta_path = jsonl_path[: -len('.jsonl')] + '.meta.json'
        meta = {}
        if os.path.exists(meta_path):
            try:
                meta = json.load(open(meta_path, encoding='utf-8'))
            except ValueError:
                meta = {}
        totals, seen = read_agent(jsonl_path)
        agents.append({
            'file': os.path.basename(jsonl_path),
            'role': meta.get('agentType') or '(unknown role)',
            'model': meta.get('model') or '(unknown model)',
            'turns': seen,
            **totals,
        })
    return agents


def fmt(n):
    return f'{n:,}'


def report(run_dir, as_json=False):
    if not os.path.isdir(run_dir):
        print(f'error: no such directory: {run_dir}', file=sys.stderr)
        return 1
    agents = collect(run_dir)
    if not agents:
        print(f'error: no agent-*.jsonl transcripts under {run_dir} — nothing to measure.', file=sys.stderr)
        print('       This reads harness internals; if the layout changed, this script is stale.', file=sys.stderr)
        return 1
    if not any(a['turns'] for a in agents):
        print(f'error: {len(agents)} transcript(s) found, none carrying a `usage` record — nothing to measure.', file=sys.stderr)
        print('       Reporting 0 here would be a lie; the shape this script reads has changed.', file=sys.stderr)
        return 1

    tot = dict.fromkeys(FIELDS, 0)
    priced = 0.0
    uncached = 0.0
    unpriced = []
    for a in agents:
        for f in FIELDS:
            tot[f] += a[f]
        p = price_of(a['model'], a)
        u = uncached_price_of(a['model'], a)
        a['usd'] = p
        if p is None:
            unpriced.append(a['model'])
        else:
            priced += p
            uncached += u

    if as_json:
        print(json.dumps({'run_dir': run_dir, 'agents': agents, 'totals': tot,
                          'usd': None if unpriced else round(priced, 2),
                          'usd_if_uncached': None if unpriced else round(uncached, 2),
                          'unpriced_models': sorted(set(unpriced))}, indent=2))
        return 0

    print(f'Run: {run_dir}')
    print()
    print(f'{"role":<22}{"model":<10}{"turns":>7}{"cache read":>14}{"cache write":>13}{"fresh in":>10}{"output":>10}{"USD":>10}')
    for a in sorted(agents, key=lambda x: -(x['usd'] or 0)):
        usd = '     n/a' if a['usd'] is None else f'{a["usd"]:8.2f}'
        print(f'{a["role"]:<22}{a["model"]:<10}{a["turns"]:>7}'
              f'{fmt(a["cache_read_input_tokens"]):>14}{fmt(a["cache_creation_input_tokens"]):>13}'
              f'{fmt(a["input_tokens"]):>10}{fmt(a["output_tokens"]):>10}{usd:>10}')
    print()
    all_input = tot['input_tokens'] + tot['cache_read_input_tokens'] + tot['cache_creation_input_tokens']
    share = (tot['cache_read_input_tokens'] / all_input * 100) if all_input else 0.0
    print(f'  cache reads   {fmt(tot["cache_read_input_tokens"]):>16}   {share:.3f}% of all input')
    print(f'  cache writes  {fmt(tot["cache_creation_input_tokens"]):>16}')
    print(f'  fresh input   {fmt(tot["input_tokens"]):>16}')
    print(f'  output        {fmt(tot["output_tokens"]):>16}   <- the only figure the run result reports')
    if unpriced:
        print()
        print(f'  NOT PRICED: {", ".join(sorted(set(unpriced)))} — no rate for that model, so no total is shown.')
    else:
        print()
        print(f'  TOTAL         ${priced:,.2f}')
        print(f'  uncached      ${uncached:,.2f}   ({uncached / priced:.1f}x, had every read been fresh input)')
    print()
    print('  Prices are list rates assumed by this script, not billing data. Check them.')
    return 0


def self_test():
    """Arithmetic only — the parsing half is covered by scripts/check-cost-report.sh."""
    ok = True

    def check(name, cond, detail):
        nonlocal ok
        print(f'{"ok   " if cond else "FAIL "} {name}' + ('' if cond else f' — {detail}'))
        if not cond:
            ok = False

    t = {'input_tokens': 1_000_000, 'cache_read_input_tokens': 0,
         'cache_creation_input_tokens': 0, 'output_tokens': 0}
    check('1M fresh input on opus is the input rate', price_of('opus', t) == 15.0, price_of('opus', t))

    t = {'input_tokens': 0, 'cache_read_input_tokens': 1_000_000,
         'cache_creation_input_tokens': 0, 'output_tokens': 0}
    check('1M cache reads cost a tenth of that', abs(price_of('opus', t) - 1.5) < 1e-9, price_of('opus', t))

    t = {'input_tokens': 0, 'cache_read_input_tokens': 0,
         'cache_creation_input_tokens': 1_000_000, 'output_tokens': 0}
    check('1M cache writes cost 1.25x', abs(price_of('opus', t) - 18.75) < 1e-9, price_of('opus', t))

    t = {'input_tokens': 0, 'cache_read_input_tokens': 1_000_000,
         'cache_creation_input_tokens': 0, 'output_tokens': 0}
    check('the uncached counterfactual prices a read as fresh input',
          uncached_price_of('opus', t) == 15.0, uncached_price_of('opus', t))

    check('an unknown model yields no price rather than a guess',
          price_of('gpt-9', t) is None, price_of('gpt-9', t))
    return 0 if ok else 1


def main(argv):
    args = [a for a in argv[1:]]
    if '--self-test' in args:
        return self_test()
    as_json = '--json' in args
    args = [a for a in args if a != '--json']
    while '--price' in args:
        i = args.index('--price')
        spec = args[i + 1] if i + 1 < len(args) else ''
        del args[i:i + 2]
        try:
            model, rates = spec.split('=', 1)
            inp, out = rates.split('/', 1)
            PRICES[model.lower()] = (float(inp), float(out))
        except ValueError:
            print(f'error: --price expects <model>=<in>/<out>, got {spec!r}', file=sys.stderr)
            return 1
    if not args:
        print(__doc__.strip(), file=sys.stderr)
        return 1
    return report(args[0], as_json=as_json)


if __name__ == '__main__':
    sys.exit(main(sys.argv))
