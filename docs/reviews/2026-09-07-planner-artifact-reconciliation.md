# Planner reconciles a supplied artifact against contracts and the brief's own prose (issue #19)

**Date:** 2026-09-07
**Verdict:** APPROVED
**Complexity:** complex
**Security surface:** none
**Coder passes:** 2 (round 1 implementation, round 2 fix pass for one critical)

## Summary

Issue #19: the Planner carried an operator-supplied DDL (`is_allowed`/`is_media_blind`) verbatim
into its plan and into a generated chunk task, even though the same brief's salvage prose said to
discard the ACL and a quoted trust contract forbids allow-lists. Nothing in the pipeline previously
asked for or carried a reconciliation. This run adds a reconciliation pass (`agents/planner.md`
section 1.6), a bare `conflicts` field on `PLAN_SCHEMA`, orchestrator-side detection
(`detectSuppliedArtifact`) and status derivation (`reconciliationStatus`) in `workflows/ldo.js`,
rendering into every downstream prompt (`renderConflicts` wired into both `renderPlan` and
`renderConstraints`), exposure on the `planOnly` result, a split-paste warning that chunk tasks do
not carry conflicts, and a tenth gate script, `scripts/check-artifact-reconciliation.sh`.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| CHANGELOG 2.36.0 entry no longer asserts a false reproducible claim ("grep -i conflict workflows/ldo.js came back empty") | passed | `git diff -- CHANGELOG.md` shows the sentence now reads: "nothing in `workflows/ldo.js` named a `conflicts` field or handled one — `renderPlan` and `renderConstraints` had nothing to render." Verified against HEAD: `git show HEAD:workflows/ldo.js \| grep -n -i conflict` → lines 1038, 3032, 3033, all git-merge comments, none a field; `grep -n 'conflicts:'` → no output; `grep -n 'function renderPlan\|function renderConstraints'` → 454, 526. Repo-wide `grep -rn 'came back empty\|grep -i conflict\|grep -n -i conflict' --include='*.md' --include='*.js' --include='*.sh' --include='*.json'` (excluding `docs/reviews/`) → no output, exit 1 — no copy of the false claim survives elsewhere. |
| CHANGELOG top entry is the 2.36.0 heading; all ten gates still pass after the fix | passed | `grep -n '^## \[' CHANGELOG.md \| head -2` → `8:## [2.36.0] — 2026-09-07`, `69:## [2.35.0] — 2026-08-30`. `ls scripts/check-*.sh \| wc -l` → 10. Foreground loop over all ten gates (check-artifact-reconciliation.sh, check-contracts.sh, check-env-status.sh, check-isolation.sh, check-model-table.sh, check-record-backlog.sh, check-redact.sh, check-schema-size.sh, check-scoped-tests.sh, check-verdict-gates.sh) → all rc=0; `node --check workflows/ldo.js` → ok. |
| Remaining reproducible claims in the 2.36.0 entry (schema arithmetic, gate count, wiring, prior field reports, ~12ms, planner.md 1.5 wording) are not fabricated | passed | `check-schema-size.sh` on a temp root holding HEAD's `ldo.js` → `PLAN_SCHEMA 3258`; on the working tree → `PLAN_SCHEMA 3313` (delta 55, matches the plan's arithmetic). `renderPlan(` call sites at `ldo.js` 2452 (Security), 2524 (first Coder), 2584 (first Review), 2877 (planOnly); `renderConstraints(` at 2525 and 2585 (both fix passes). `CONTROL_NO_ARTIFACT` assertion present at `check-artifact-reconciliation.sh:129`, driving three plain tasks through `detectSuppliedArtifact`. "~12ms" figure originates at `scripts/check-schema-size.sh:5`. The three cited "field reports" map to real earlier CHANGELOG entries: fullSuiteAt (CHANGELOG.md:537-548), worktree/Planner-never-created-one (CHANGELOG.md:73-83), contract-carrying (CHANGELOG.md:299). HEAD `agents/planner.md` 1.5 reads "Carry anything relevant into the plan verbatim, not paraphrased" with no check step, matching the claim. "NONE —" form consistent across `planner.md:47,190`, `ldo.js:1555`, `CHANGELOG.md:35`. |
| Steps 1-7 (schema field, detection helpers, renderConflicts, phasePlan wiring, planOnly exposure, planner.md section 1.6, gate script) | passed | Not re-driven in the fix pass: `git diff --stat` for round 2 shows only `CHANGELOG.md` changed, which cannot affect `ldo.js`, `planner.md` or the gate script. Round-1 evidence stands; the ten-gate run above independently re-confirms step 7's "all ten scripts pass" and step 1's schema size of 3313. |

## Hard constraint verified

`PLAN_SCHEMA` measured at 3258/3400 chars before this change (87 headroom was actually 142 per the
brief's stated baseline; working figure used in this run's plan was 3258). The bare
`conflicts: { type: 'array', items: { type: 'string' } }` field, with no `description` property,
adds 55 serialized characters, landing at 3313/3400 — 87 chars of headroom remain. A description
property on the same field was measured (in planning, not reproduced by the Reviewer) at 3407,
which breaches the 3400 ceiling — this is why all prose for the reconciliation rule lives in
`agents/planner.md` instead of the schema itself.

## Issues found and fixed

- [critical] `CHANGELOG.md` (2.36.0 entry): asserted a specific reproducible grep result
  ("`grep -i conflict workflows/ldo.js` came back empty") that was false at HEAD → replaced with a
  claim the Reviewer independently verified true: "nothing in `workflows/ldo.js` named a `conflicts`
  field or handled one — `renderPlan` and `renderConstraints` had nothing to render."

## Issues left unfixed (advisory)

None reported by the Reviewer for this run.

## Notes on scope of this review

- No attacks were run or re-run in the fix pass — a CHANGELOG-only edit changes no runtime code
  path, so round-1's criteria 1-7 and its five held attacks were not re-verified; the Reviewer
  states this explicitly and independently re-confirmed the two claims most likely to have drifted
  (gate count, top CHANGELOG heading) instead of trusting the round-1 record blindly.
- The Coder changed no code in the fix pass, so there was no new archaeology-comment surface and
  nothing to revert-prove beyond what round 1 already established.
- One figure in the CHANGELOG ("3407 with a description") is a plan-time counterfactual whose exact
  value depends on the description text chosen; the Reviewer did not reproduce it and flags it as
  not independently falsifiable, but not as a defect.

## Security findings

None. Security surface for this task was rated `none` — no auth, secrets, user input, or crypto
touched; the change is confined to the Planner's own prompt-construction and the orchestrator's
plan-schema/rendering code.
