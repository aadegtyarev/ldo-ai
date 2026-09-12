#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'

import { unresolvedPlanConflicts } from './core/pipeline.mjs'

const workflow = readFileSync('workflows/ldo.js', 'utf8')
const planner = JSON.parse(readFileSync('schemas/planner.json', 'utf8'))
const researcher = JSON.parse(readFileSync('schemas/researcher.json', 'utf8'))
const plannerPrompt = readFileSync('agents/planner.md', 'utf8')
const researcherPrompt = readFileSync('agents/researcher.md', 'utf8')
const reviewerPrompt = readFileSync('agents/reviewer.md', 'utf8')
const recorderPrompt = readFileSync('agents/recorder.md', 'utf8')
const contractSkill = readFileSync('skills/ldo-contract/SKILL.md', 'utf8')

const failures = []
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures.push(label) }
const states = ['covered', 'not_applicable', 'research_required', 'contract_candidate', 'resolved']
const schemaStates = planner.properties.surface_analysis?.properties.surfaces?.items.properties.coverage?.enum || []
check('portable Planner requires a non-empty surface_analysis matrix', planner.required.includes('surface_analysis') && planner.properties.surface_analysis.properties.surfaces.minItems === 1)
check('coverage states are explicit and complete', JSON.stringify(schemaStates) === JSON.stringify(states))
check('Researcher returns routed, evidence-backed contract candidates', researcher.required.includes('contract_candidates') && researcher.properties.contract_candidates.items.required.includes('target') && researcher.properties.contract_candidates.items.required.includes('evidence'))
check('Claude workflow requires the same matrix and runs focused research before a resolution Planner pass', /required: \[[^\]]*'surface_analysis'/.test(workflow) && workflow.indexOf('researchSurfaceGaps(task, plan, coverageGaps') < workflow.indexOf("planner-resolution"))
check('unresolved coverage and product choices return before Security and Code', workflow.indexOf("mode: 'resolution-required'") < workflow.indexOf('// The host-side half') && /if \(planResult\.resolutionRequired\) \{/.test(workflow) && workflow.indexOf('if (planResult.resolutionRequired) {') < workflow.indexOf('const planReviewAdvice = recommendPlanReview(plan)'))
check('Reviewer receives the matrix in full and forbids approval on omissions', /renderSurfaceAnalysis\(plan\)/.test(workflow) && reviewerPrompt.includes('Approval is impossible'))
check('Recorder cannot downgrade a pre-code contract gap', recorderPrompt.includes('Never reinterpret or downgrade'))
check('Planner applies baseline engineering principles without waiting for operator prompts', plannerPrompt.includes('ordinary professional judgment') && plannerPrompt.includes('least surprise'))
check('/ldo-contract separates product areas instead of using code.md as a catch-all', contractSkill.includes('Product/area contract') && contractSkill.includes('Do not use `code.md` as a miscellaneous bucket'))
check('Researcher receives the same routing, 200-character, provenance, and no-write procedure', ['docs/contracts/<area>.md', 'at most 200 characters', 'provenance', 'Never write a contract'].every(text => researcherPrompt.includes(text)))

// The conflicts gate is driven, not grepped, and on BOTH runtimes at once: a
// Codex run stalled with all three of its conflicts reading RESOLVED, because
// the gate blocked every entry that did not start `NONE —` and the Planner had
// no other way to say a decision had been made. Same rule, two sources — the
// Claude function is brace-extracted out of workflows/ldo.js (same technique as
// check-artifact-reconciliation.sh) so nothing below is a copy of what it
// checks, and the Codex one is imported from core/pipeline.mjs directly.
const extract = name => {
  const starts = [`const ${name} =`, `function ${name}(`].map(pattern => workflow.indexOf(pattern)).filter(index => index >= 0)
  if (!starts.length) return null
  const start = Math.min(...starts)
  let depth = 0
  for (let k = start; k < workflow.length; k++) {
    const c = workflow[k]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === '\n' && depth === 0) return workflow.slice(start, k)
  }
  return null
}
const gateParts = ['SETTLED_CONFLICT', 'settledConflict', 'unresolvedProductConflicts'].map(name => extract(name))
check('the Claude conflicts gate is present to drive', gateParts.every(Boolean))
const claudeGate = gateParts.every(Boolean)
  ? new Function(`${gateParts.join('\n')}\nreturn unresolvedProductConflicts`)()
  : () => ['gate not found']

const OPEN = 'ARTIFACT: DDL keeps is_allowed (brief §3) vs prose drops the ACL (brief §1) — DECISION: which one ships'
const settledCases = [
  ['NONE — checked the DDL against docs/contracts/trust.md', ['NONE — checked the DDL against docs/contracts/trust.md']],
  ['RESOLVED — kept the DDL column (operator decision, brief §3)', ['RESOLVED — kept the DDL column (operator decision, brief §3)']],
  ['RESOLVED: lowercase and a colon still read as settled', ['resolved: kept the column (operator decision)']],
  ['a whole array of settled entries', ['NONE — nothing to reconcile', 'RESOLVED — dropped the ACL (brief §1)', 'RESOLVED — kept the index (docs/contracts/code.md)']],
]
for (const [label, conflicts] of settledCases) {
  const claude = claudeGate({ conflicts })
  const codex = unresolvedPlanConflicts({ conflicts })
  check(`a settled conflict clears both gates — ${label}`, claude.length === 0 && codex.length === 0)
}
// CONTROL in the opposite direction, which is the whole reason the marker is a
// prefix and not a keyword search: a gate that let any mention of the word
// through would stop blocking the decisions it exists to catch.
check('CONTROL: an open conflict still blocks both gates', claudeGate({ conflicts: [OPEN] }).length === 1 && unresolvedPlanConflicts({ conflicts: [OPEN] }).length === 1)
check('CONTROL: the word appearing later in the entry does not clear it', claudeGate({ conflicts: ['The operator has not resolved this yet — DECISION: pending'] }).length === 1 && unresolvedPlanConflicts({ conflicts: ['The operator has not resolved this yet — DECISION: pending'] }).length === 1)
check('CONTROL: one open entry beside settled ones still blocks', claudeGate({ conflicts: ['NONE — clean', OPEN] }).length === 1 && unresolvedPlanConflicts({ conflicts: ['NONE — clean', OPEN] }).length === 1)
// The focused Researcher runs inside phasePlan, so its report only reaches the
// result if phasePlan hands it back and runOneFeature takes it — otherwise the
// run says `researched: false` about research it paid for, and the Recorder
// never sees that pass's contract candidates.
check('the focused surface research reaches the result instead of dying inside phasePlan', /return \{ plan, models, CTX, surface, DO_SECURITY, WORKTREE_BLOCK, scopedTests, researchReport \}/.test(workflow) && /researchReport = planResult\.researchReport \?\? researchReport/.test(workflow) && /let \{ researchReport \} = await phaseResearch/.test(workflow))

// Under args.tasks a blocked feature has no error and no verdict. Both summaries
// used to read that as something else: the plan-only one printed '✓ planned',
// the full one '✗ no worktree — see error above' with no error above it.
const blockedParts = ['renderResolutionRequired'].map(name => extract(name))
check('a blocked feature has its own summary line to print', blockedParts.every(Boolean))
const renderBlocked = blockedParts.every(Boolean) ? new Function(`${blockedParts.join('\n')}\nreturn renderResolutionRequired`)() : () => ''
const blockedLine = renderBlocked({ unresolvedCoverage: [{ id: 'cli' }, { id: 'config' }], unresolvedConflicts: ['ARTIFACT: secret text that must not be quoted'] })
check('the blocked line counts what is open and quotes none of it', blockedLine.includes('2 unresolved surface(s)') && blockedLine.includes('1 open product choice(s)') && !blockedLine.includes('secret text'))
check('both multi summaries count and name a blocked feature', (workflow.match(/mode === 'resolution-required'/g) || []).length >= 4 && /need resolution, \$\{failed\} failed/.test(workflow) && /blocked, failed \}/.test(workflow))
check('a blocked feature is not counted as a failure', /f\.mode !== 'resolution-required' && \(f\.error \|\| !f\.verdict\)/.test(workflow))

check('Planner is told how to mark a conflict it settled', plannerPrompt.includes('RESOLVED —') && plannerPrompt.includes('Only `NONE —` and `RESOLVED —` clear the gate'))

if (failures.length) {
  console.error(`\n✗ Surface-contract governance failed: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\n✓ Surface discovery, research, contract resolution, review, and recording fail closed.')
NODE
