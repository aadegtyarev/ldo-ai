# Act on five structural findings from LDO's own docs and code audits

**Date:** 2026-09-08
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** elevated
**Coder passes:** 2 (round 1 + one fix pass)

## Summary

Five pre-verified structural findings from a cold `/ldo-docs-audit` and `/ldo-code-audit`
were closed: (1) `config.blockingSeverities` was taken raw, case-sensitive, with no
top-level `CONFIG` key allowlist — a typo or a bare string made every issue non-blocking
and the run reported approved over real defects; (2) `collectContractCandidates` and
`detectDesignDrift` were called only below `phaseRecord`'s early return, so both
operator-facing signals were silently inert on trivial runs and ordinary rejections;
(3) `.claude/ldo-runs.json` carries four statuses (`shipped`, `failed`, `completed`,
`interrupted`) the resume protocol never defined, and the recovery filter keyed on the
single string `running`; (4) `safeTestPath` was a second copy of `safeMigrationsDir`,
divergent on four input classes; (5) a resumed plan dropped `run_command` with nothing
telling the Reviewer to rediscover it, silently weakening verification.

Round 1 was reviewed and sent back with two findings on `partitionTestPaths`'s de-dup
behaviour (see Issues, now fixed). The fix pass closed both, was independently
re-verified against the code (not the Coder's account), and is APPROVED.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `partitionTestPaths` comment claims `a/b`/`a/b/` cannot both be substituted — code must deliver it | passed | `workflows/ldo.js` L475-482: `const normalized = safeTestPath(s); const key = normalized ?? s; if (seen.has(key)) continue; seen.add(key); if (normalized) safe.push(normalized) else dropped.push(s)`. Header comment L464-466 updated to match. Driven: `["a/b","a/b/"]` → `{"safe":["a/b"],"dropped":[]}` → `pytest 'a/b'`; `["a/b/","a/b//"]` → same; `["a/b/","a/b//","a/b"]` → safe `["a/b"]`; `[" a/b/ ","a/b"]` → safe `["a/b"]`; `["a/b","..","a/b/","..","-rf"]` → safe `["a/b"]`, dropped `["..","-rf"]`. |
| `partitionTestPaths` pushes the NORMALIZED value (not the raw one) | passed | Same drive; CONTROL `["a/b","a/c"]` → `pytest 'a/b' 'a/c'` (distinct paths not collapsed); `["tests/.cache/t.py","tests/.cache/t.py/"]` → one selection under the dot-prefix exception. `bash scripts/check-scoped-tests.sh` rc=0, prints `✓ partitionTestPaths de-dups two spellings of one path down to one selection` and `✓ ... three spellings ...`. |
| New gate assertions actually catch the defect (revert-and-restore, plus a round-1-shape targeted proof) | passed | Standard: diff of 10 non-script files saved, files checked out to HEAD, gate rc=1 with `✗ partitionTestPaths de-dups two spellings ... safe ["a/b","a/b/"] -> pytest 'a/b' 'a/b/'`; patch reapplied, `git diff` md5 `fc5eddb4…` identical before/after (`TREE IDENTICAL`); gate rc=0 again. Targeted: a copy differing only at L478 (`const key = s`, the round-1 shape) run as `bash scripts/check-scoped-tests.sh . round1.js` → rc=1 with exactly the two de-dup assertions red (`safe ["a/b","a/b"] -> pytest 'a/b' 'a/b'`, and the three-spellings variant) while both CONTROLs and the pre-existing NORMALIZED assertion stay green. |
| All 16 gate scripts exit 0; `node --check` passes | passed | `for f in scripts/check-*.sh; do bash "$f"; done` → passed=16 failed=0 (artifact-reconciliation, config-validation, contracts, cost-accounting, design-drift, env-status, isolation, model-table, plan-signals, record-backlog, redact, schema-size, scoped-tests, vendor, verdict-gates, version-lockstep). `node --check workflows/ldo.js` → ok. |
| Docs edited by the fix (CHANGELOG, README, CLAUDE.md) describe the de-dup the code actually has | passed | CHANGELOG 2.40.0: "Its de-dup keys on the same normalized form, so `a/b` and `a/b/` reach the runner as one selection rather than as two of the same file." README Contributing paragraph for `check-scoped-tests.sh` names the two assertions at L329/L342. CLAUDE.md drift log: "safeTestPath delegates to the one path validator; scoped paths are normalized then de-duped" — matches code order. |

## Attacks

| Vector | Outcome | Evidence |
|--------|---------|----------|
| Re-run of round-1 broke: `['a/b','a/b/']` and `['a/b/','a/b//']` | held | `["a/b","a/b/"]` → `{"safe":["a/b"],"dropped":[]}` → `pytest 'a/b'`; `["a/b/","a/b//"]` → same. |
| Spelling variants mixed with whitespace padding and interleaved rejected entries | held | `[' a/b/ ','a/b']`, `['a/b ',' a/b']`, `['a/b','..','a/b/','..','-rf']` each collapse to safe `["a/b"]`; the last drops `["..","-rf"]` once each, no repeats. |
| Scale: 5000 entries cycling 10 files with alternating trailing slash | held | `[5000 entries]` → safe 10 (`t/0.py`…`t/9.py`), dropped 0; no growth beyond distinct normalized keys. |
| Absence/shape: `[]`, `null`, non-string entries `[null, undefined, 42, 'a/b']` | held | `[]`/`null` → `{"safe":[],"dropped":[]}`. Non-strings → safe `["null","undefined","42","a/b"]` via the pre-existing `String(p)` coercion (identical at HEAD L405) — no crash, no duplication; reported as a pre-existing minor, not a regression of this fix. |

## Issues found and fixed

- [major] `workflows/ldo.js` `partitionTestPaths` (round 1): de-dup keyed on the raw string instead of the normalized form, so `a/b` and `a/b/` were both substituted into the test runner as two selections of the same file. Fixed by keying the seen-set on `normalized ?? s` and pushing the normalized value — proven above by both the direct drive and the round-1-shape targeted revert.

## Issues left unfixed (advisory)

- [minor] `workflows/ldo.js` L405 (pre-existing, not introduced by this run): `partitionTestPaths` coerces non-string entries via `String(p)`, so `[null, undefined, 42, 'a/b']` yields safe `['null','undefined','42','a/b']` and `pytest 'null' 'undefined' '42' 'a/b'`. `safeRelPathSegments` deliberately rejects non-strings, but the coercion one level up defeats that for this caller. Hypothesis: drop the `String(p)` branch and let a non-string fall through to `dropped`, keeping the typed rejection the core already has — check first whether `PLAN_SCHEMA`/`VERDICT_SCHEMA` already type the relevant arrays as strings, since then the blast radius is a malformed model reply.
- [minor] `workflows/ldo.js`: three pre-existing comments (L721-722, L898-899, L913-914) pair a real constraint with a "used to" history clause that belongs in the CHANGELOG rather than the source. Not a contract violation (each does state something the code can't show), but worth trimming — `grep -n 'used to' workflows/ldo.js` finds all three.

## Security findings (if any)

- [medium] injection: the invalid-severity warning is specified to print "rejected entries verbatim", and `unknownConfigKeys` emits one warning per unrecognised top-level key with no `collapseLines`/`capList` treatment and no cap — both are operator-supplied strings reaching a `log()` line and the Record prompt unescaped, the same forging class `workflows/ldo.js:600-605` already documents for `## ISSUES`-prefixed content. Fix: wrap every rejected entry and unknown key name in `collapseLines(...)`, cap the assembled list with `capList(...)` (matching `contractWarnings`/`renderDesignDrift`), prefer `JSON.stringify(collapseLines(x))` for severity values to match the existing `config.tests.scope is invalid (...)` shape. Add a `check-config-validation.sh` assertion driving both functions with a `\n## ISSUES`-bearing entry/key and asserting no warning string contains a newline.
- [medium] config: a `blockingSeverities` list that is entirely valid but omits `critical` (e.g. `["nit"]`) passes the enum check and is honoured — `isBlocking` becomes false for every real critical the Reviewer or Security raises, with only a transient `⚠` log line and nothing carried onto the run's `result` object that `/ldo-ship` and the tracking entry read. Fix (pick one, comment why): (a) union the resolved list with `['critical']` unconditionally, or (b) carry a flag on the verdict the way `NOT PROVEN` already does. Add a `check-config-validation.sh` assertion that `['nit']` produces the override/flag, not a bare honoured list.
- [medium] input_validation: `skills/ldo-resume/SKILL.md` requires two explicit checks on `transcriptDir` (resolves under the projects dir AND basename matches the runId) because `.claude/ldo-runs.json` is agent-writable and untrusted, but `argsFile` in Recovery step 1 gets no equivalent check — the protocol reads it and calls `Workflow` with the object verbatim, including `task` and `config`. Fix: add the same-standard check to `argsFile` (resolves under `.claude/ldo-args/` in the current project AND basename is exactly `<runId>.json`); on failure, fall through to the journal instead of reading it. State explicitly that additional fields on a run-tracking entry are read past and never interpreted as a path/command/instruction.
- [low] input_validation: the shared `safeRelPathSegments` extraction doesn't specify where `.trim()` lives; `safeTestPath` trims today (L390) but `safeMigrationsDir` doesn't (L805). If the shared core trims, `safeMigrationsDir`/`safeWorktreePath` newly accept whitespace-padded values that `SAFE_REL_PATH` currently rejects — a widening the plan's own fixture table doesn't cover. Also: `renderMigrations` (L517/521) validates `plan.migrations.directory` by truthiness but renders the raw value, not the normalized return — the same validate-one-form/use-another pattern this run closes on the test-path side. Fix: keep `.trim()` in the `safeTestPath` wrapper only, add whitespace fixtures (`' a/b '`, `'a/b '`, `' '`) to the byte-identity assertion, and render the normalized migrations directory instead of the raw one.
- [low] auth: the rediscovery instruction to the Reviewer requires naming what was checked only in the failure case; on success nothing records which command was substituted for the stripped one, so a resumed run's verification can't be compared against the run it claims to continue. Fix: require the rediscovered command (and where it was found — package.json/Makefile/CI config/README, mirroring `agents/coder.md:19`) to be named in the evidence of the criteria it drove, succeeded or not. Add to the step-5 gate assertions that `renderRecoveredCommands(['run_command'])` mentions the evidence requirement, not only the word "rediscover".

## Notes

Round-1 criteria and attacks marked passed/held were not individually re-run in the fix
pass, since the fix touched only `partitionTestPaths`; the full 16-gate suite rerun
(Step 8 of the plan) covers the gate-level half. `docs/contracts/` (`code.md`, `scope.md`)
were read before this verdict; no violation found in the fix-pass changes.
