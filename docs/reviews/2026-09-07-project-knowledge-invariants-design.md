# Project knowledge invariants and the design-document boundary (issue #20)

**Date:** 2026-09-07
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** elevated
**Coder passes:** 3 (fix-pass round 3 approved)

## Summary

Five items under one theme: LDO neither produces nor consumes a project's knowledge
about itself, and every gap was invisible from the operator's side. Two of the
issue's own diagnoses were corrected against the code before acting: (1a) the
contract-length check (`scripts/check-contracts.sh`) already existed — the gap was
delivery, not measurement; it was referenced only in README and a trailing note in
`/ldo-contract`, never in either skill's process steps. (1b) the truncation is
upstream in the Planner, not the orchestrator's render cap — `renderConstraints`
warns only on fix-pass `plan.risks`, and `renderSecurity` renders `security_notes`
uncapped and unmeasured; nothing measures a contract file at the point it's read.

Item 2 required an explicit decision, written into README: **LDO does not own
per-subsystem design documents** — no format, no template, no skill. Reasons:
the design reasoning LDO produces is already persisted (`docs/reviews/<date>-<slug>.md`
per run, `docs/ARCHITECTURE.md` as the cross-run map); `docs/contracts/scope.md`
forbids duplicating an existing role/skill and `/ldo-docs-audit` already warns about
exactly this shape of duplication; half-owning an artifact is worse than declining
it. What LDO does own is the *drift check*: `config.design.map` declares
`{glob, doc}` pairs, and the orchestrator (no filesystem access) matches globs
against a run's changed files and reports — never writes — a doc that fell behind.

Item 5(b) was a live data-loss bug: `/ldo-init` step 4 said to "replace everything
between the markers with the current block" while a later line claimed the drift
log was preserved — this repo's own CLAUDE.md carried 53 drift-log lines a re-run
would have destroyed. Fixed with an ordered capture-count-restore-verify procedure
stated at the destructive instruction itself, not 70 lines away.

Delivered across 14 steps / three new gates (`check-version-lockstep.sh`,
`check-plan-signals.sh`, `check-design-drift.sh`), plus `LDO_VERSION` so the
pipeline can log and compare its own version against the stamp it writes into a
project's CLAUDE.md block.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No comment in the design-drift block narrates the replaced RegExp implementation | passed | `sed -n 2135,2352p workflows/ldo.js \| grep -n -i 'replaced\|compiled to\|previously\|no longer\|backtracked\|11ms\|205\|873\|two minutes\|includes()'` → only hit is a live-constraint sentence about a TDZ error, not history |
| Glob and path normalized on the same terms; a glob normalizing to nothing is rejected with a warning | passed | Harness over extracted `resolveDesignMap`+`detectDesignDrift`: `./src/**`, `/src/**`, `src//**`, `src/**/`, `src\auth\**` each match both relative and absolute changed files, 0 warnings. Degenerate `/`, `./`, `..`, `\`, `.`, `//`, `/./`, `./..`, ` / ` each rejected with "names no path once normalized", matched=[] |
| New gate assertions catch the defect (revert proof) | passed | Scratch copy with only line 2318 reverted to `entry.glob.trim()` → `bash scripts/check-design-drift.sh "$PWD" $S/reverted.js` fails the 5 spelling assertions, rc=1; `git show HEAD:workflows/ldo.js` copy also rc=1; live source rc=0, 39 ✓ |
| All 13 `scripts/check-*.sh` gates exit 0; `node --check` passes | passed | `node --check workflows/ldo.js` → NODE_CHECK_OK; loop over all 13 gates → PASS x13 |
| Docs describe two-sided normalization and match the code | passed | README §Design-doc drift, §Contributing, CHANGELOG 2.37.0 entry each state normalized comparison; reproduced by harness above |
| CLAUDE.md unchanged outside `ldo:features` markers | passed | `git diff -U0 CLAUDE.md \| grep '^@@'` → single hunk `@@ -104,0 +105,8 @@`; marker count 61 (53 original + 8 appended) |
| HARD CONSTRAINT: PLAN_SCHEMA headroom not spent | passed | `bash scripts/check-schema-size.sh` reports 3313/3400 unchanged; no plan field added — every new signal reuses `plan.risks`, coder `deviations`, `verdict.summary`, or lives on the result object / run log only |
| `/ldo-init` step 4 preserves the drift log by hand-executed procedure | passed | Following the rewritten procedure against this repo's own CLAUDE.md leaves exactly 53 lines between `<!-- ldo:features -->` markers before and after |
| `check-contracts.sh` reachable from a numbered process step, not only README | passed | `grep -n 'check-contracts.sh' skills/ldo-contract/SKILL.md skills/ldo-init/SKILL.md` matches inside numbered process steps, using `${CLAUDE_PLUGIN_ROOT}` |
| Version lockstep across five copies | passed | `grep -c '2.37.0' .claude-plugin/marketplace.json` = 3, `.claude-plugin/plugin.json` = 1; `bash scripts/check-version-lockstep.sh` exits 0; failing against `git show HEAD:workflows/ldo.js` (no `LDO_VERSION`) names the missing copy |

## Attacks

| Vector | Outcome | Evidence |
|--------|---------|----------|
| Round-2 broke re-run: normalized glob spellings (`./src/**`, `/src/**`, `src//**`, `src/**/`, `src\auth\**`) vs relative and absolute changed files | held | All five: 0 warnings, both files matched; gate has one assertion per spelling, each fails on the one-line-reverted scratch copy |
| Degenerate globs `/`, `./`, `..`, `\`, `.`, `...`, ` / `, `/./`, `./..`, `//` | held | All but `...` rejected with "names no path once normalized"; `...` accepted as a literal segment matching nothing (harmless) |
| Normalizer side effects inside a glob (`src/../lib/**`, `src/**/../x.ts`, `src/auth/**:12`, `src/x.ts:3-9`) | held | All accepted and fire correctly; `:NN` line-suffixes stripped so the glob still matches its file |
| Round-2 broke re-run: globstar zero-directory edge (`src/**/x.ts` vs `src/x.ts`, `**/x.ts` vs `x.ts`) | broke | matched=[] for both — pre-existing from round 2, not caused by this fix; reported minor |
| Round-2 broke re-run: Recorder-side `forbiddenDocs` raw comparison with `./` or absolute `files_written` | broke | lines 3263-3268 compare raw after only `.trim()` — no `normalizeIssuePath`/`sameFilePath`; advisory-only, pre-existing from round 2; reported minor |
| Doc-side suppression with odd spellings (`./docs/design/auth.md`, `docs//design/auth.md`, `docs\design\auth.md`, `/w/docs/design/auth.md`, bare `auth.md`) | broke | First four correctly suppress; bare `auth.md` also suppresses via `sameFilePath`'s reverse suffix match — a root-level file sharing the basename silences drift. Pre-existing from round 2; reported minor |
| Shape attacks: unicode glob, `\n## ISSUES` in a glob, glob with a space, non-string glob `12345`, 196-char slash-stuffed glob | held | Newlines collapsed on render (forgery check asserted in gate); non-string glob rejected with "missing or not a non-empty string"; slash-stuffed glob normalizes and matches |
| Scale: 40 entries × 250 files × 400-char paths, normalized 10-wildcard globs | held | accepted=40, warnings=0, drift=0, ms=1135 — bounded, no false drift |

## Issues found and fixed

Fixed over the fix-pass rounds leading to this approval (issue 1 and issue 2 of the
round-3 verdict, both re-verified in this pass):
- [critical] `workflows/ldo.js` design-drift block: comments narrated the replaced
  RegExp implementation's history instead of stating live constraints — rewritten
  to state what the current code must/does do
- [major] `workflows/ldo.js:2318` `detectDesignDrift`: glob was normalized but the
  changed-file path was not, so a glob written as `./src/**` or `src\auth\**`
  never matched — fixed by running the glob through `normalizeIssuePath` on the
  same terms as the path, and rejecting a glob that normalizes to no path segment

## Issues left unfixed (advisory)

- [minor] `workflows/ldo.js` `globMatch` (line 2234): no zero-directory case for
  `**/`, so `src/**/x.ts` does not match `src/x.ts` and `**/x.ts` does not match a
  repo-relative `x.ts`. Pre-existing from round 2, not introduced by this fix;
  under-reports in the direction of silence.
- [minor] `workflows/ldo.js` `phaseRecord` forbiddenDocs check (lines 3263-3268):
  compares Recorder `files_written` raw after only `.trim()` — a path spelled
  `./docs/design/auth.md` or absolute is not warned about. Advisory-only hole,
  pre-existing from round 2.
- [minor] `workflows/ldo.js` `detectDesignDrift` line 2323: `sameFilePath`'s
  suffix match in both directions lets a changed file whose normalized path is a
  bare `auth.md` suppress drift for `docs/design/auth.md`. Fails toward silence;
  uncommon trigger. Pre-existing from round 2's `sameFilePath` adoption.

## Security findings (if any)

- [medium] resource: unbounded/adjacent-wildcard globs (`**/**/**/**/**/**/x.md`)
  compile to catastrophic-backtracking regex; `detectDesignDrift` runs up to 40
  compiled patterns × N changed files (model-authored, length-unbounded array).
  Also: an unanchored pattern lets a glob of `docs` match any path containing that
  substring. → cap glob length/wildcard-token count in `resolveDesignMap`, collapse
  consecutive `**`/`*` runs, anchor `^...$`, no `g` flag; cap files iterated in
  `detectDesignDrift`.
- [medium] injection: `doc` validation only rejects absolute paths and `..`
  segments — admits a newline/`\r`/leading `#`, which could forge a section header
  in the Record prompt (the class `collapseLines` already guards for `plan.risks`).
  Matched files come from model-authored `coderResult.files_changed` with no
  guarantee they're collapsed before rendering. → validate `doc` with the existing
  `safeMigrationsDir`/`SAFE_REL_PATH` discipline rather than a second, weaker
  validator; `collapseLines()` and `capList()` every doc/glob/matched-file string
  before it enters `renderDesignDrift`'s output.
- [medium] auth: both new blocks hand config- and model-supplied paths to the
  Recorder (tools: Read, Write, Edit, Bash) and rely entirely on prompt text as
  the control — `verifyRecordLocation` returns `false` immediately on a
  single-feature run (the documented default), so there is no orchestrator-side
  detection in the common case, and `agents/recorder.md`'s Rules section carries
  no `docs/contracts/` prohibition today (only section-3 prose). → add
  orchestrator-side detection independent of `ctx.isMulti`; add the prohibition to
  the Rules list, not only section 3.
- [medium] supply_chain: the vendored-install fallback path
  (`.claude/LDO_VENDORED.md`) that skills/ldo-contract's new step points to does
  not exist — `scripts/vendor.sh` never writes a script path into it, only a
  version and date. An agent told to run a check it cannot locate is exactly the
  agent that falls back to a cwd-relative `scripts/check-contracts.sh` (the
  `/ldo-feedback`/redact.sh defect class). → drop the LDO_VENDORED.md branch;
  resolve only `"${CLAUDE_PLUGIN_ROOT:?}/scripts/check-contracts.sh"`, and on
  vendored installs fall back to reading+counting with an explicit "not
  reachable" message, never search elsewhere.
- [medium] injection: if the contract-measurement one-liner is written so an agent
  substitutes a discovered filename into it, a filename containing `$(...)`,
  backticks, `;` or a leading `-` becomes shell syntax under the Planner's own
  Bash tool. → prescribe a command that never interpolates a discovered name
  (`awk ... -- docs/contracts/*.md`); forbid constructing the command from a
  listed filename.
- [low] resource: `plan.risks`, `coderResult.deviations` and lines of
  `verdict.summary` are unbounded in practice; only `collectContractCandidates`
  is specified with `capList`. → run every returned list through `capList()`
  before logging/rendering; keep `recommendPlanReview`'s string composed from
  fixed reason text only, never quoted conflicts/risks content.
- [low] data_exposure: backlog items from both new signals reach GitHub under
  `config.backlog.destination: "github"` with no redaction step, unlike
  `/ldo-feedback`'s `scripts/redact.sh` path. → add a prompt-level "state the rule
  abstractly, never quote a credential/token/endpoint/identifier" sentence to the
  CONTRACT CANDIDATES block and to `agents/coder.md`/`agents/reviewer.md`;
  structural redaction of the backlog path is larger work, tracked separately.
- [info] injection: new gates must follow `check-contracts.sh`'s existing
  heredoc-safety shape (`set -euo pipefail`, quoted `<<'NODE'`, values via
  `process.env`, no `$` expansion inside the heredoc body) — held today, flagged
  so it isn't lost on a future edit.
- [info] config: the version stamp is an unauthenticated staleness hint, not a
  check — nothing in `workflows/ldo.js` should ever read or branch on it.

## Operator note (from the Reviewer, outside the diff)

The scoped test template handed to this fix pass was `bash {paths}` rendered over
Markdown files, which would execute SKILL.md files as shell; the Coder correctly
refused it and ran the real gate set instead. The Planner's `test_command_scoped`
for this repo should not be a bare `bash` — flagged to the operator, not a defect
in this change.
