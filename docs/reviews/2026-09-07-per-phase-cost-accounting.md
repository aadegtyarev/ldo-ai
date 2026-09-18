# Per-phase cost accounting for LDO runs

**Date:** 2026-09-07
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** none
**Coder passes:** 1

## Summary

Adds per-phase output-token accounting to `workflows/ldo.js`. Every agent call
already funnels through `runAgent`, so one bracket there plus a per-feature
ledger carried on `ctx` produces an ordered entry per agent call. The
accounting rests on three constraints confirmed against the harness
(Claude Code 2.1.263): the `budget.spent()` global returns **output tokens
only** (no input, no cache read/write — so it cannot answer whether prompt
caching helps), the pool is **shared** across the whole turn (so a per-phase
figure is a delta, not an attribution), and it is **per-turn** (so everything
reported is a delta from a run-start baseline). An unmeasurable reading
degrades to an explicit `unavailable`/`partial` status with a named reason —
never to `0`, matching the `record_status`/`env_status`/`full_suite_status`
precedent in this codebase.

The `cost` block sits top-level in the result (beside `env_status`,
`full_suite_status`, `work_location`), not inside `stats`, because it
qualifies the result rather than counting something about it — same
precedent as those other fields.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Step 1: `readSpent`/`createCostLedger` primitives never throw, never return 0 on failure | passed | `node --check workflows/ldo.js` exit 0. Gate: clean two-phase run → total 300, entries 150/150. No-`budget`-global case → `status: unavailable, total: null`, non-empty reason. Throwing `spent()` → `status: unavailable, total: null` (never 0). |
| Step 2: ledger wired through `runAgent` and all 7 call sites | passed | `grep -c 'ledger: ctx.ledger' workflows/ldo.js` → 7. Drive script over extracted `runAgent` with a throwing agent still produced an entry (ledger closed in `finally`); ledger stripped from opts handed to `agent()`. No agent prompt text changed in this step. |
| Step 3: one `Cost (...)` log line per feature; unavailable form names no `0` | passed | Log line: `Cost (output tokens, delta from run start): 13.0k total — planner 1.0k, boom 1.0k, flaky 1.0k, flaky 1.0k, reviewer-1 1.0k, reviewer-1 1.0k`. With budget removed: `Cost accounting unavailable — the run-start baseline could not be read: ... The run still spent output tokens; they could not be measured.` Regex check for a bare `0` figure in that line → false. |
| Step 4: `cost` top-level in `shapeResult`/`shapePlanOnly`, not inside `stats` | passed | `grep -n` shows `cost:` at the same 4-space indent as `env_status:` (lines 3606, 3693) and `stats: {` afterward (3637, 3694) — outside it. |
| Step 5: `## COST` block in Record prompt; honesty sentence present; `agents/recorder.md` untouched | passed | Rendered block: `## COST (output tokens — record only)` / "no input tokens, no cache reads, no cache writes ... cannot say whether prompt caching is helping" / `- Total: 13000` / per-entry lines. Unavailable form: `- Total: not measured`. `git diff --name-only | grep -c recorder.md` → 0. |
| Step 6: `scripts/check-cost-accounting.sh` — 12+ named scenarios, revert proof | passed | Gate run: 29 assertions, all `✓`, exit 0. Revert proof: `git checkout -- workflows/ldo.js` then gate → exit 1, naming missing `cost` and `renderCostLine`; `git apply` restores it → exit 0; `git diff` byte-identical to the saved patch. Full 14-gate suite + `node --check` → ALL GATES PASS. |
| Step 7: version bumped to 2.38.0 in all 5 lockstep places; CHANGELOG entry | passed | `scripts/check-version-lockstep.sh` → all five copies `2.38.0`. CHANGELOG `## [2.38.0] — 2026-09-07` contains all five run ids/figures and the "cost tracks turns" conclusion. |
| Step 8: README "Fourteen gates", cost paragraph; CLAUDE.md drift log +1 line | passed | `grep -c 'Thirteen gates' README.md` → 0, `'Fourteen gates'` → 1. `grep -c 'no input tokens' README.md` → 1. CLAUDE.md diff → exactly one new drift-log line. |

## Attacks

| Vector | Outcome | Evidence |
|--------|---------|----------|
| `spent()` returns Infinity / BigInt / boolean / object / null-or-0 budget | held | Every case → `status: unavailable`, `total: null`, reason names the offending value; no throw. |
| `budget.spent` is a **throwing getter** | broke | `createCostLedger` propagated the getter's exception (`'getter bomb'`) instead of converting it to an unavailable reason — the shape check runs outside the try. Filed as minor (contrived vector: a real harness object has no getter). |
| `spent()` throws a bare string | held | Reason: `the harness spent function threw: string thrown`. |
| Label with newline / forged `## FORGED HEADING` / 5000-char label / undefined phase-label | held | Newlines collapsed, no forged heading (`/\n## FORGED/` → false), label truncated to 200 chars with ellipsis, undefined → `unknown`/`unknown`. |
| 60 entries past `COST_ENTRIES_MAX = 40` | held | `status: partial`, `entries.length: 40`, reason names the 20 dropped entries; log capped at 10 + "+30 more". |
| Two ledgers interleaved on one shared counter (parallel features) | held | Both report their own overlapping totals; `unattributed` goes negative under `concurrent` and is not clamped — documented behaviour. |
| `runAgent` with `opts` undefined / ledger present but no phase/label | held | Undefined opts → agent result returned normally. Ledger-only → entry `{phase: 'unknown', label: 'unknown', output_tokens_delta: 0}` (a genuine 0 from an unmoving fake counter, not a masked failure). |
| `finish()` called twice with an entry appended between calls | held | First total 100 (1 entry), second total 500 (2 entries) — the Record-time snapshot is rendered to a string immediately and not re-read later. |
| Huge delta (1e21) and fractional readings | held | 1e21 → measured but renders as `1e+21` (filed as nit — unreachable for real token counts). Fractional 0.5→10.7 → total 10.2, rendered `10` via rounding. |
| `renderCostLine(null)` / measured block with no entries | held | `renderCostLine(null)` → explicit unavailable sentence, never a bare `0`. |

## Issues found and fixed

None reported as fixed in this pass — the run above described is the initial (round 1) approved implementation; no defects required a fix round.

## Issues left unfixed (advisory)

- [minor] `workflows/ldo.js` `readSpent` (~line 2054): the shape check `typeof budget.spent !== 'function'` runs **outside** the try/catch, so a `budget` whose `spent` is a throwing getter escapes `readSpent` and `createCostLedger` entirely and fails the whole run over an accounting figure. Reproduced with `Object.defineProperty({}, 'spent', { get() { throw new Error('getter bomb') } })`. Contrived (the harness hands a plain object) but violates the plan's "open/close/finish must never throw" guarantee. Hypothesis: move the `!budget || typeof budget.spent !== 'function'` test inside the same try block (keep the `typeof budget === 'undefined'` check first, since that one can't throw); add a throwing-getter case to the gate's NEVER-BREAKS-A-RUN assertion.
- [minor] `workflows/ldo.js` `renderCost`: unconditionally emits "Your own Record phase is NOT in these figures... The run log and the returned result carry a later, larger total that does" — even on an unavailable/partial block where nothing was actually measured, producing a contradictory pair of sentences in the same block. Hypothesis: condition the second half on `Number.isFinite(cost.total_output_tokens_delta)`, and drop "larger" (a real delta could legitimately be 0).
- [minor] Pre-existing, not introduced by this change: `runOneFeature`'s first log line and the two summary lines (3734, 3901, 3938) still reference `budget` bare rather than through the `typeof budget === 'undefined'` guard. Line 3734 runs before `ctx.ledger` is created, so if a future harness build stops injecting the `budget` global, the run dies with a `ReferenceError` there before `readSpent`'s guard is ever reached — the "budget absent" path the new gate drives is not reachable end-to-end in a real run today.
- [nit] `costFigure` uses `String(Math.round(n))`, which renders exponent notation (`1e+21`) for deltas ≥ 1e21. Unreachable for real output-token counts (`Number.MAX_SAFE_INTEGER` ≈ 9e15); recorded only because the coder's contract requires every prompt figure to be a formatted integer.

## Security findings (if any)

none
