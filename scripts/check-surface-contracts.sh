#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'

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
check('unresolved coverage and product choices return before Security and Code', workflow.indexOf("mode: 'resolution-required'") < workflow.indexOf('// The host-side half') && /if \(planResult\.resolutionRequired\) return planResult/.test(workflow))
check('Reviewer receives the matrix in full and forbids approval on omissions', /renderSurfaceAnalysis\(plan\)/.test(workflow) && reviewerPrompt.includes('Approval is impossible'))
check('Recorder cannot downgrade a pre-code contract gap', recorderPrompt.includes('Never reinterpret or downgrade'))
check('Planner applies baseline engineering principles without waiting for operator prompts', plannerPrompt.includes('ordinary professional judgment') && plannerPrompt.includes('least surprise'))
check('/ldo-contract separates product areas instead of using code.md as a catch-all', contractSkill.includes('Product/area contract') && contractSkill.includes('Do not use `code.md` as a miscellaneous bucket'))
check('Researcher receives the same routing, 200-character, provenance, and no-write procedure', ['docs/contracts/<area>.md', 'at most 200 characters', 'provenance', 'Never write a contract'].every(text => researcherPrompt.includes(text)))

if (failures.length) {
  console.error(`\n✗ Surface-contract governance failed: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\n✓ Surface discovery, research, contract resolution, review, and recording fail closed.')
NODE
