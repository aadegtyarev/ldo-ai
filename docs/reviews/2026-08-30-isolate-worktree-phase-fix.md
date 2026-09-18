# Fix `isolate: true` being inert — add a verified Isolate phase

**Date:** 2026-08-30
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** elevated
**Coder passes:** not stated in verdict (multiple rounds implied by the nine security mitigations and the two attack-derived fixes; treat as multiple)

## Summary

Issue #12: `isolate: true` (and `args.tasks`) set `ctx.isMulti` and a `worktreeHint`, but nothing in the orchestrator ever created a worktree — the only creation mechanism was prose in the Planner's prompt asking it to run `git worktree add` as a side task, and the only gate tested that two model-authored strings (`plan.worktree_path`, `plan.branch`) were non-empty. A Planner that skipped the step and reported a path still passed the gate; every later agent then received an ISOLATION block naming a directory that didn't exist, `cd` failed, and the run silently edited the main working tree. This was measured directly: a control pair of two runs with the same `isolate: true` flag in the same session — the one with worktree prose hand-written into the task got a worktree, the one without it wrote 27 files / 1678 insertions straight into the operator's tree.

The fix adds a dedicated `Isolate` phase that runs before Research/Plan whenever `ctx.isMulti`, performed by a new single-purpose `isolator` agent (Bash only, no `model:` in frontmatter — routing stays in `workflows/ldo.js`). It reports four independent git outputs, which the orchestrator cross-checks in a pure `verifyWorktreeProof()` — not asserted by the agent. The structural discriminator is `git rev-parse --absolute-git-dir`: a linked worktree returns `<root>/.git/worktrees/<name>`, a main checkout returns `<root>/.git`, so the observed failure (agent never created a worktree, ran commands where it stood) cannot produce a passing proof. A failed proof aborts the feature before the Planner ever runs, with an explicit `{error, approved:false}` — isolation that can't be proven costs one run, not a dirty tree. The verified path/branch overwrite `plan.worktree_path`/`plan.branch`, and a new `work_location` (`'worktree' | 'working_tree'`) field is added to the result, derived from the verified isolation object rather than the input flag.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Step 1 — proof primitives added, schema-size gate green, declarations brace-extractable | passed | `node --check workflows/ldo.js` → OK; `scripts/check-schema-size.sh` → PASS with `ISOLATION_SCHEMA` included; brace-extractability proven by `check-isolation.sh` itself extracting and running `safeWorktreePath`/`parseWorktreeList`/`verifyWorktreeProof` standalone |
| Step 2 — a main-checkout proof (bad `git_dir` or `toplevel === main_root`) errors out instead of continuing; `runOneFeature` calls `phaseIsolate` before `phasePlan` | passed | `check-isolation.sh`: "rejects a main-checkout git_dir…", "rejects toplevel === main_root", "a failed proof returns an explicit error object", "runOneFeature calls phaseIsolate BEFORE phasePlan" all green; against pre-change source (`git show HEAD~1:workflows/ldo.js` equivalent) the same assertions fail with `phaseIsolate at -1, phasePlan at 579` |
| Step 3 — no remaining Planner-creates-worktree prose; prior source still had it; all 9 gates still green | passed | `grep 'create your own\|creates its own worktree' workflows/ldo.js` → nothing; `git show HEAD:workflows/ldo.js \| grep -c 'create your own isolated worktree'` → 1; all nine gates PASS |
| Step 4 — `agents/isolator.md` exists with no `model:` frontmatter; vendor.sh copies 7 agent files and rewrites `ldo:isolator` → `isolator` | passed | Frontmatter checked: name/description/tools only. `vendor.sh` into scratchpad copied 7 files including `isolator.md`; vendored `ldo.js` line 2081 read `agentType: 'isolator'` |
| Step 5 — `check-isolation.sh` exits 0 against current source, non-zero against a pre-change copy (naming the missing `verifyWorktreeProof` and un-called `phaseIsolate`); executable | passed | `bash scripts/check-isolation.sh` → PASS (exit 0). Against `/tmp/pre.js`: exit 1, `verifyWorktreeProof: not found in …pre.js`, `runOneFeature calls phaseIsolate BEFORE phasePlan — phaseIsolate at -1, phasePlan at 579`. `ls -l` → `-rwxrwxr-x` |
| Step 6 — version bumped to 2.35.0 everywhere; CHANGELOG entry present | passed | `grep -c '2.35.0'` → plugin.json:1, marketplace.json:3; `grep -m1 '^## \[' CHANGELOG.md` → `## [2.35.0] — 2026-08-30`; the pasted revert-proof output in the CHANGELOG matches the actual run verbatim |
| Step 7 — README/SKILL.md updated, no stale "Planner creates its own worktree" text | passed | `grep 'Planner creates its own worktree' README.md` → nothing; `check-isolation` mentioned ≥2 places; `work_location` mentioned ≥1; SKILL.md updated to "seven agentType strings" |
| Step 8 — `node --check` and all nine gates pass; drift log updated | passed | `node --check` OK; `check-contracts`, `check-env-status`, `check-isolation`, `check-model-table`, `check-record-backlog`, `check-redact`, `check-schema-size`, `check-scoped-tests`, `check-verdict-gates` all PASS; CLAUDE.md drift log shows the two new lines |

## Attacks

| Vector | Outcome | Evidence |
|--------|---------|----------|
| Newline injected into `worktree_path`/`branch` (journal-forging) | held | `verifyWorktreeProof` on a path with an embedded `\nFORGED LINE` → `{ok:false, reason:'worktree_path is not a safe relative path under .worktrees/'}`; same for branch |
| Unicode segment, tab, shell metacharacters, dash-leading segment, nested dot segment, `..` traversal, absolute path | held | All rejected with distinct reason strings, via both the gate's named assertions and direct drives of the extracted function |
| Empty path segment (`.worktrees/a//b`) in an otherwise fully-consistent proof | **broke** | `verifyWorktreeProof` returned `{ok:true, path:'.worktrees/a//b',…}` — pre-existing gap inherited from `safeMigrationsDir`, reachable only via fabrication (real `git rev-parse` never emits `//`). Filed as a minor issue below, not fixed in this run |
| Adopted branch (`head_sha !== base_head`), non-sha values, numeric field coercion | held | Mismatch → `'the branch was adopted, not created with -b'`; `'not-a-sha'` → `'not a commit sha'`; numeric coercion assessed as a non-issue (schema declares strings, shape+equality still satisfied) |
| Resource bounds: `worktree_list` at 64KB / 64KB+1, 250-entry porcelain list, non-string/array list values | held | At-cap verifies ok; over-cap → its own reason string; parser caps at 200 entries; non-string inputs yield `[]` without throwing |
| Porcelain shape abuse: CRLF endings, out-of-order `worktree`/`branch` lines, bare-repo block, block missing a `worktree` line, main-only listing, matching entry on wrong branch | held | CRLF handled via trim; order-independent parsing confirmed; bare block dropped; main-only → `'fewer than two worktrees'`; wrong branch → its own reason |
| The exact issue-#12 omission shape: all four commands run in the main checkout | held | `{ok:false, reason:'toplevel is the main checkout — no worktree was entered'}`; dressed-up toplevel with a main-checkout `git_dir` → `'git_dir is not a linked worktree git dir — a main checkout returns <root>/.git'` |
| Deliberate fabrication: four mutually consistent forged outputs rooted at `/evil` | held (by design, documented limit) | Passes verification, as the plan/CHANGELOG/README all state explicitly — orthogonal consistency checks are not cryptographic proof; the mitigation is scoped to the observed failure mode (omission), not adversarial fabrication |
| Data exposure: does `worktree_list` or `main_root` reach the result object, a log line, or a downstream prompt | held | `grep -n worktree_list workflows/ldo.js` → only the schema/required-fields declarations, `verifyWorktreeProof`, and the isolator prompt; `phaseIsolate` returns only `{path, branch, root}`; failure notes pass through `quoteRejected` (120-char cap) |

## Issues left unfixed (advisory)

- [minor] `workflows/ldo.js` (`safeWorktreePath`, shares logic with `safeMigrationsDir` at line 715): accepts an empty path segment — a fully-consistent, fabricated proof with `worktree_path: '.worktrees/a//b'` verifies `ok:true`. Pre-existing (inherited from `safeMigrationsDir`, confirmed unchanged at HEAD too), only reachable via full fabrication since a real `git rev-parse --show-toplevel` never emits `//`. Suggested fix: add `segments.some(seg => !seg)` to the existing rejection in `safeMigrationsDir` at line 715 — one line, fixes both consumers.
- [minor] `scripts/vendor.sh`: pre-existing (reproduced at HEAD) — its post-transform guard greps for any remaining `ldo:` and trips on three `ldo:ldo` **workflow-name** strings inside log-line prose (vendored `ldo.js` lines 1048, 3111, 3122), which the `agentType` sed correctly leaves untouched. Vendoring itself works (7 agent files copied, `ldo:isolator` rewritten), but the tool reports failure on every run, training operators to ignore its exit code. Suggested fix: narrow the guard to `agentType: 'ldo:` instead of bare `ldo:`. Explicitly out of this plan's scope per the reviewer.

## Security findings

All nine were implemented as mitigations within this run and individually confirmed by the reviewer (including grep-proof that `worktree_list` never reaches a result, log, or downstream prompt); none are left open.

- [high] race_condition: isolator prompt now carries an explicit deny-list — never `git worktree remove`, `--force`, `prune`, `git branch -D/-f`, `git worktree add -B`, `rm -rf`, no remote/credential operations; only additive creation with a fresh suffix, reporting failure if all suffixes are taken.
- [medium] input_validation: added `base_head`/`head_sha` fields to `ISOLATION_SCHEMA`; `verifyWorktreeProof` requires `head_sha === base_head` so an adopted (`-B` or bare-checkout) branch fails distinctly from a fresh `-b` branch.
- [medium] input_validation: segment validation tightened to match `safeMigrationsDir`'s precedent — rejects any segment starting with `-`, and any segment equal to `.` or `..`.
- [medium] resource: length/line bounds added — `worktree_path`/`branch` capped at 200 chars before regex evaluation, `worktree_list` capped at 64KB, `parseWorktreeList` capped at 200 entries, each with its own reason string.
- [medium] data_exposure: rejected/model-authored values routed through `quoteRejected` before reaching `log()` or the error string; `worktree_list` itself never enters `shapeResult`/`shapePlanOnly` or Recorder inputs — only the derived `{path, branch, root}` survives.
- [low] data_exposure: the committed fixture (`scripts/fixtures/worktree-proof.json`) uses a synthetic root (`/srv/repo`), not a path captured under the operator's real home directory — verified via `grep -rn '/home/' scripts/fixtures/` returning nothing.
- [low] input_validation: `parseWorktreeList` now guards each line with `startsWith('worktree ')`/`startsWith('branch ')` rather than assuming line position, skips blocks with no `worktree ` line, and returns the same trimmed values it validated.
- [low] resource: isolator now ensures `.worktrees/` is in `.gitignore` before creating anything, and an exhausted-suffix case gets its own named reason string.
- [info] config: `work_location` is derived from the verified isolation object (`isolation ? 'worktree' : 'working_tree'`), not from the raw input flag, so it cannot read `'worktree'` unless `verifyWorktreeProof` actually returned `ok`.

## Notes

- The two unfixed issues above are filed as GitHub issues: [#16](https://github.com/aadegtyarev/ldo-ai/issues/16) (empty path segment) and [#17](https://github.com/aadegtyarev/ldo-ai/issues/17) (vendor.sh false-positive guard). No `backlog` label exists in this repo, so neither issue carries a label, per the recording rule of not creating labels.
- `docs/ARCHITECTURE.md` does not exist in this repo; the equivalent doc is README.md's `## How it works` / `## Why only three core agents` / `## Pipeline` / `## Files` sections, a decision already recorded in `docs/reviews/2026-08-28-fix-ldo-issues-5-8.md`. This run's own Step 7 already updated those sections (Isolate phase in the pipeline diagram, `isolator.md` in Files, `work_location` in Configuration), so no further architecture edit was needed — see the Notes in `files_written` below for what was checked, not changed.
