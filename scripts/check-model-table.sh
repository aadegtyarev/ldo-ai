#!/usr/bin/env bash
# The model-routing table is duplicated in four places on purpose (a runnable
# default, a copy-paste reference, and two docs explaining it) — but "on
# purpose" doesn't mean "safe to drift." This project has hit the exact same
# regression (recorder/maxParallelFeatures missing from one copy, tiers gone
# stale in another) three separate times across the session, caught only by
# a full docs-audit after the fact. This script is the mechanical fix: run
# it, and drift is a failure at check time, not a finding weeks later.
#
# Source of truth: DEFAULT_MODELS in workflows/ldo.js. Every other copy is
# checked against it. Usage: scripts/check-model-table.sh [repo-root]

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const TIERS = ['trivial', 'medium', 'complex']
const ROLES = ['planner', 'coder', 'reviewer', 'security', 'researcher', 'recorder']

// Extract a { tier: { role: model, ... }, ... } object from a chunk of text
// that contains role:model pairs per tier line — deliberately loose (handles
// both JS object-literal shorthand and JSON) since the four copies aren't
// byte-identical in formatting, only in the values that matter.
// tierPattern(tier) must match up to (not including) the row's opening '{'.
function extractTable(text, tierPattern) {
  const table = {}
  for (const tier of TIERS) {
    const re = new RegExp(`${tierPattern(tier)}\\s*\\{([^}]*)\\}`, 's')
    const m = text.match(re)
    if (!m) continue
    const row = {}
    for (const role of ROLES) {
      const roleMatch = m[1].match(new RegExp(`${role}"?\\s*:\\s*['"]([a-z]+)['"]`))
      if (roleMatch) row[role] = roleMatch[1]
    }
    if (Object.keys(row).length) table[tier] = row
  }
  return table
}

function diff(name, table, source) {
  const problems = []
  for (const tier of TIERS) {
    if (!table[tier]) {
      problems.push(`${name}: missing the '${tier}' row entirely`)
      continue
    }
    for (const role of ROLES) {
      if (!(role in table[tier])) {
        problems.push(`${name}: ${tier}.${role} is missing`)
        continue
      }
      if (table[tier][role] !== source[tier][role]) {
        problems.push(`${name}: ${tier}.${role} = '${table[tier][role]}', source has '${source[tier][role]}'`)
      }
    }
  }
  return problems
}

const files = {
  'workflows/ldo.js': readFileSync('workflows/ldo.js', 'utf8'),
  'ldo-config.example.json': readFileSync('ldo-config.example.json', 'utf8'),
  'README.md': readFileSync('README.md', 'utf8'),
  'skills/ldo-config/SKILL.md': readFileSync('skills/ldo-config/SKILL.md', 'utf8'),
}

const source = extractTable(files['workflows/ldo.js'], t => `${t}:`)
if (!source.trivial || !source.medium || !source.complex) {
  console.error('error: could not parse DEFAULT_MODELS out of workflows/ldo.js — the source-of-truth format changed. Fix this script\'s regex before trusting any comparison.')
  process.exit(1)
}

let problems = []
problems = problems.concat(diff('ldo-config.example.json', extractTable(files['ldo-config.example.json'], t => `"${t}"\\s*:`), source))
problems = problems.concat(diff('README.md', extractTable(files['README.md'], t => `"${t}"\\s*:`), source))
problems = problems.concat(diff('skills/ldo-config/SKILL.md', extractTable(files['skills/ldo-config/SKILL.md'], t => `"${t}"\\s*:`), source))

if (problems.length) {
  console.error(`✗ Model table drift found (source of truth: workflows/ldo.js DEFAULT_MODELS):\n`)
  problems.forEach(p => console.error(`  - ${p}`))
  console.error(`\nFix the listed files to match workflows/ldo.js, or update DEFAULT_MODELS if it's the one that's actually wrong.`)
  process.exit(1)
}

console.log('✓ All four copies of the model routing table match workflows/ldo.js.')
NODE
