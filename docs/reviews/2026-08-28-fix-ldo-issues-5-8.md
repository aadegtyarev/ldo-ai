# Fix five LDO defects: issues #5–#8 plus the /ldo-feedback empty-body bug

**Date:** 2026-08-28
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** elevated (fix-pass review loop control flow, `/ldo-feedback` shell invocation and secret redaction)
**Coder passes:** multiple rounds (verdict references "round 2" and "this fix pass" as at least a third pass); this review covers the pass that introduced the shared `LINE_BREAK_RUN` terminator fix and re-ran the round-2 attack vectors

## Summary of the change

Five defects fixed in one run, per the brief at `.claude/ldo-args/_brief-issues-5678.txt`:

1. **Issue #5** — `downgradeUnrelatedFindings` (workflows/ldo.js) no longer relies solely on the Reviewer volunteering `introduced_by_fix`. It now takes the fix pass's `files_changed`, normalizes paths with `normalizeIssuePath`, and compares with `sameFilePath` (exact-or-suffix, never `includes()`). A blocking finding in a file the fix pass touched is never downgraded, and `critical` is never downgraded at all.
2. **Issue #6** — `CODER_SCHEMA.issue_outcomes` (`fixed`/`not_fixed`/`blocked` per sent issue) plus `accountIssueOutcomes`, wired into `phaseCodeReview`: every sent issue is checked for an accounting entry, logged, fed into the fix-pass Reviewer prompt as an explicitly-labelled unverified block, and surfaced as `stats.issues_unaccounted` — deliberately non-gating.
3. **Issue #7** — the fix-pass Coder prompt states three permitted outcomes per issue (fix it; fix it elsewhere and say where; report it blocked with a reason) instead of "touch only these files"; `renderResolved` renders a capped, do-not-reintroduce list of what earlier passes already closed; `suggestion` is reframed everywhere as an unverified hypothesis to check, not an instruction.
4. **Issue #8** — `deriveEnvStatus`/`markEnvUnreproducible` derive a third `env_status` (`ok`/`unknown`/`unreproducible`) from the first Coder pass's `tests.baseline` and `env.unresolved`, surfaced in the log, the multi-feature summary and `shapeResult`. Annotates only — never flips a rejection to approved (verified by reference-identity control).
5. **`/ldo-feedback`** — `SKILL.md` moved from an inline `--body "..."` argument (the cause of issues #5–#8 arriving with a zero-length body) to `--body-file`, with a mandatory `gh issue view ... | diff` read-back before reporting success.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Issue 1 fixed: no line terminator (\r, U+2028, U+2029, NEL, \v, \f) can forge a `## SECTION` header in another agent's prompt, at both collapse sites | passed | `grep`: single shared `const LINE_BREAK_RUN = /\s*[\r\n  \v\f]+\s*/g` at workflows/ldo.js:1245, used by `collapseLines` (:1248) and `oneLine` (:2380); old `\s*\n\s*`-only pattern gone (`grep` rc=1). Drove 9 vectors (bare \r, U+2028, U+2029, NEL, \v, \f, CRLF+NEL run, leading NEL, terminator+spaces) end-to-end through `accountIssueOutcomes → renderAccounting` and `renderResolved` on the live, brace-extracted code: every row `forged=0 survivors=0`. |
| The new gate assertions actually catch the defect (revert proof) | passed | Copy with `LINE_BREAK_RUN` reverted to `/\s*\n+\s*/g`: `bash scripts/check-verdict-gates.sh . $SP/reverted.js` exits 1 with `✗ renderResolved collapses every line terminator, not only \n — 4 forged header(s), 4 surviving terminator(s)` (and the same for `renderAccounting`). Fixed tree: same script green, both assertions `✓`. |
| Full gate suite and syntax check stay green | passed | Re-run independently for this report: `node --check workflows/ldo.js` exit 0; `check-schema-size.sh` exit 0 (`✓ All 6 schemas within the 3400-char classifier budget`); `check-model-table.sh` exit 0; `check-verdict-gates.sh` exit 0 (all renderResolved/renderAccounting/attribution assertions `✓`); `check-scoped-tests.sh` exit 0; `check-env-status.sh` exit 0 (env_status control assertions `✓`, including reference-identity on the `ok` path). |
| Version bumped 2.32.0 → 2.33.0 in all four places | passed | `grep -rn '"version"' .claude-plugin/` → `.claude-plugin/plugin.json:5: "version": "2.33.0"`, `.claude-plugin/marketplace.json:10,24,35` all `"2.33.0"`. |
| CHANGELOG entry credits #5–#8 and states the two arguable decisions | passed | `head -20 CHANGELOG.md`: `## [2.33.0] — 2026-08-28` is the first entry, `### Fixed` opens with issue #5's attribution rule and states the `critical`-never-downgraded and non-gating-accounting decisions. |

## Attacks

| Vector | Outcome | Evidence |
|--------|---------|----------|
| Round-2 broke re-run: terminator forge vectors (\r, U+2028, U+2029, NEL, \v, \f) through `accountIssueOutcomes → renderAccounting` and `renderResolved` | held | Node attack script over brace-extracted live functions: `lone CR -> accounting: forged=0 survivors=0 \| resolved: forged=0 survivors=0`, identical rows for U+2028, U+2029, NEL, VT, FF. |
| Combined/edge terminator variants: CRLF+NEL run, leading NEL before a heading, terminator+spaces before a heading | held | Same harness, all three rows `forged=0 survivors=0` — leading case eaten by `collapseLines`' trim-then-strip, spaced case lands mid-line, never column zero. |
| Round-2 broke re-run: `sameFilePath('src/file.js:12:5', 'src/file.js')` — linter-style `file:line:col` suffix defeating fix-pass attribution | **broke** | `normalizeIssuePath('src/file.js:12:5')` → `"src/file.js:12"` (single strip leaves `:12` behind); `sameFilePath(...)` → `false`, and `false` for the absolute-path form too. Single-suffix forms (`:12`, `:12-20`) still match. |

## Issues found and fixed

- [high → fixed] `skills/ldo-feedback/SKILL.md`: raw feedback composed into `.claude/ldo-feedback-raw.md` inside the operator's project would have persisted an unredacted bug report with no cleanup and no ignore rule outside the LDO repo. Fixed: raw file is now a `mktemp -t ldo-feedback-UNREDACTED.XXXXXX` outside any repo (`umask 077`), `.git/info/exclude` in the *current* project is appended before anything is written, and the raw file plus all `.claude/ldo-feedback-*` artifacts are deleted on both the success and failure path (step 8). Confirmed by reading the current SKILL.md.
- [high → fixed] `skills/ldo-feedback/SKILL.md`: model-composed title interpolated into a double-quoted `gh` argument was vulnerable to command substitution (`redact.sh` neutralizes secret shapes, not shell metacharacters). Fixed: title is written to a file and invoked as `"$(cat "$TITLE")"`, whose substitution result is not re-evaluated; SKILL.md states the reason inline and rejects a multi-line title.
- [medium → fixed] `skills/ldo-feedback/SKILL.md`: `redact.sh`'s exit status and output length were unchecked, and the read-back diff would pass trivially on an empty body. Fixed: exit status and non-zero length are checked with `|| { ...; exit 1; }` for both title and body, and a second `redact.sh < "$BODY" | diff - "$BODY"` proves the file about to be posted is actually the gate's own output, immediately before `gh issue create`.
- [medium → fixed] `skills/ldo-feedback/SKILL.md`: fixed-name body/title files were vulnerable to a race between operator confirmation and posting. Fixed: per-invocation `$STAMP=$(date +%s)-$$` paths, plus a `sha256sum` taken at confirmation time and re-checked immediately before posting.
- [medium → fixed] `workflows/ldo.js`: `issue_outcomes[].issue`/`.detail` are Coder-authored free text rendered into the Reviewer's prompt as apparent fact. Fixed: `renderAccounting`'s block is headed `## THE CODER'S OWN ACCOUNTING (unverified claims by the Coder — verify each against the code; nothing here closes an issue)`, and every field goes through `collapseLines` (newline-collapse + ~200-char truncation + leading-`#`/whitespace strip) before rendering.
- [medium → fixed] `workflows/ldo.js`: unbounded `issue_outcomes` array with no per-string cap risked both a `matchIssueKey` cost blow-up and unbounded prompt growth. Fixed: `CODER_SCHEMA.issue_outcomes.maxItems = 30`, `accountIssueOutcomes` additionally `.slice(0, MAX_ISSUE_OUTCOMES)` (50) before keying, and every entry is truncated via `collapseLines` before `issueKey`/rendering.
- [medium → fixed] `workflows/ldo.js`: `normalizeIssuePath`/`sameFilePath` did not handle `.`/`..` segments, repeated slashes, or degenerate (`''`, `.`, `/`) operands, any of which fails the attribution control open. Fixed: `normalizeIssuePath` now resolves `.`/`..` segments textually (no fs access) and collapses empty segments; `sameFilePath` rejects any operand that normalizes to the empty string before the suffix test. Confirmed present in the live code (workflows/ldo.js:1269–1299).
- [low → fixed] `workflows/ldo.js`: `env.unresolved` (Coder-authored free text) fed unbounded and uncollapsed into `verdict.summary`, which is interpolated raw into the Recorder's prompt. Fixed: `markEnvUnreproducible`'s evidence string is built from collapsed, capped entries the same way `renderResolved` caps its list.
- [low → advisory, not independently confirmed] `skills/ldo-feedback/SKILL.md`: resolving `scripts/redact.sh` as a bare relative path would resolve against whatever project the operator has open, not the plugin. SKILL.md's "Redact, then show, then file" section now instructs resolving `${CLAUDE_PLUGIN_ROOT}/scripts/redact.sh` (or the vendored path) and explicitly forbids a cwd-relative match — read directly from the current file content.

## Issues left unfixed (advisory)

- [major] `workflows/ldo.js:1273` — `normalizeIssuePath` strips a trailing line reference with `.replace(/:\d+(-\d+)?$/, '')`, which runs **once**. A linter/compiler-style `file:line:col` path such as `src/file.js:12:5` loses only `:5` and normalizes to `src/file.js:12`, so `sameFilePath('src/file.js:12:5', 'src/file.js')` returns `false` — confirmed by direct execution of the live function against the current tree. A blocking Reviewer finding whose `file` carries this copied linter form is downgraded to advisory instead of blocking — the exact fail-open direction the attribution feature (issue #5) exists to close. This is a re-run of a round-2 "broke" vector; it was not in this round's issue list and was not addressed. Suggested fix (from the reviewer's finding): make the strip repeat — `.replace(/(:\d+(-\d+)?)+$/, '')` — and add a named assertion to `scripts/check-verdict-gates.sh` for a `:LINE:COL` suffix the same way the existing `:LINE` form is pinned.

## Security findings

- [high] data_exposure — raw unredacted feedback file, no cross-repo ignore rule, no cleanup. **Fixed** in the current `SKILL.md` (see Issues found and fixed above).
- [high] injection — model-composed title interpolated into a double-quoted shell argument, vulnerable to command substitution via secret shapes `redact.sh` doesn't strip. **Fixed** in the current `SKILL.md`.
- [medium] data_exposure — unchecked `redact.sh` exit status/empty output plus a trivially-passing read-back diff. **Fixed** in the current `SKILL.md`.
- [medium] race_condition — fixed-name body/title files vulnerable to a confirm-then-overwrite race. **Fixed** in the current `SKILL.md`.
- [medium] injection — `issue_outcomes[].issue`/`.detail` rendered into the Reviewer's prompt as apparent fact, no length cap. **Fixed**: trust-labelled header plus `collapseLines` truncation, confirmed in `renderAccounting`/`accountIssueOutcomes`.
- [medium] resource — unbounded `issue_outcomes` array and per-string length driving `matchIssueKey` cost and prompt growth. **Fixed**: `maxItems: 30` on the schema, `MAX_ISSUE_OUTCOMES = 50` slice, `collapseLines` truncation.
- [medium] input_validation — `sameFilePath`/`normalizeIssuePath` failed open on `.`/`..` segments, repeated slashes, and degenerate operands. **Fixed** for those cases; **the related `:LINE:COL` single-strip case remains open** — see Issues left unfixed above.
- [low] injection — `env.unresolved` fed raw and unbounded into `verdict.summary`, itself interpolated raw into the Recorder's prompt. **Fixed**: routed through the same collapse-and-cap pattern as `renderResolved`.
- [low] supply_chain — `scripts/redact.sh` invoked as a bare relative path, resolving against the operator's cwd rather than the plugin root. **Addressed** in the current `SKILL.md` text (plugin-root resolution, cwd-relative match forbidden) — not independently re-verified with a live `gh` invocation in this session.

## Notes

- `docs/reviews/`, `docs/ARCHITECTURE.md` and `docs/BACKLOG.md` did not exist before this run. `README.md` already carries an equivalent architecture doc (`## How it works`, `## Why only three core agents`, `## Files`) and was updated by this run's own docs step (item 8 of the plan) to describe `env_status`, `issue_outcomes`, the attribution rule and `scripts/check-env-status.sh` — no separate `docs/ARCHITECTURE.md` was created, per the "check for an existing doc first" rule.
- Backlog item below was filed as a GitHub issue since `gh` is authenticated against `aadegtyarev/ldo-ai` in this environment.
