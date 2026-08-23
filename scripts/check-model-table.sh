#!/usr/bin/env bash
# The model-routing table is duplicated in four places on purpose (a runnable
# default, a copy-paste reference, and two docs explaining it) — but "on
# purpose" doesn't mean "safe to drift." This project has hit the exact same
# regression (recorder/maxParallelFeatures missing from one copy, tiers gone
# stale in another) three separate times across the session, caught only by
# a full docs-audit after the fact. This script is the mechanical fix: run
# it, and drift is a failure at check time, not a finding weeks later.
#
# Matching copies aren't enough: the table also has to survive the merge with
# config.models. Four byte-identical tables tell you nothing about what a
# partial override actually routes — a tier-level spread leaves every role the
# operator didn't name with no model, and the drift check above passes anyway.
# So the second half drives the real mergeModelTable, brace-extracted out of
# workflows/ldo.js, and asserts the behaviour rather than the text.
#
# Source of truth: DEFAULT_MODELS in workflows/ldo.js. Every other copy is
# checked against it. The second argument points the merge assertions at a
# different copy — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so a
# pre-fix failure can be demonstrated without editing this script.
# Usage: scripts/check-model-table.sh [repo-root] [path-to-ldo.js]

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const TIERS = ['trivial', 'medium', 'complex']
const ROLES = ['planner', 'coder', 'reviewer', 'reviewerFix', 'security', 'researcher', 'recorder']

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
} else {
  console.log('✓ All four copies of the model routing table match workflows/ldo.js.')
}

// ── the merge, not just the table ──────────
// Same technique as check-verdict-gates.sh: find the declaration, then walk
// forward counting brackets until the first newline at depth zero.
const target = process.env.TARGET
const mergeSrc = readFileSync(target, 'utf8')
const extract = name => {
  const starts = [`const ${name} =`, `function ${name}(`].map(p => mergeSrc.indexOf(p)).filter(i => i >= 0)
  if (!starts.length) return null
  const i = Math.min(...starts)
  let depth = 0
  for (let k = i; k < mergeSrc.length; k++) {
    const c = mergeSrc[k]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === '\n' && depth === 0) return mergeSrc.slice(i, k)
  }
  return null
}

// Reported through console.error as well as `problems` because this one
// explains every assertion failure below it: without it the operator sees four
// "could not run" lines and no reason.
const fatal = msg => {
  console.error(`✗ ${msg}`)
  problems.push(msg)
}

let merge = null
let defaults = source
const defaultsSrc = extract('DEFAULT_MODELS')
const mergeFnSrc = extract('mergeModelTable')
if (!mergeFnSrc) {
  fatal(`mergeModelTable: not found in ${target}. Either this source predates the per-role merge fix — that version spread whole tier rows, so a partial config.models override left most roles with no model at all — or this script's extraction is stale. Expected when pointing at a pre-fix copy; a failure anywhere else.`)
  // Drive that source's own routeModels with the override its docs advertise,
  // so pointing this script at a pre-fix copy prints the defect rather than
  // only reporting broken plumbing. Diagnostic: `problems` is already
  // populated and the run exits non-zero either way.
  const routeSrc = defaultsSrc && extract('routeModels')
  if (routeSrc) {
    try {
      const route = new Function(`${defaultsSrc}\n${routeSrc}\nreturn routeModels`)()
      const row = route('medium', { models: { medium: { coder: 'haiku', reviewer: 'opus' } } }) || {}
      const unrouted = ROLES.filter(r => typeof row[r] !== 'string')
      console.error(`  ↳ pre-fix behaviour of ${target}: routeModels('medium', {models:{medium:{coder:'haiku',reviewer:'opus'}}}) → ${JSON.stringify(row)} — unrouted role(s): ${unrouted.join(', ') || 'none'}`)
    } catch (e) {
      problems.push(`could not reconstruct the pre-fix behaviour of ${target} (${e.message}) — this script's extraction is stale.`)
    }
  }
} else if (!defaultsSrc) {
  fatal(`DEFAULT_MODELS: not found in ${target} — this script's extraction is stale.`)
} else {
  try {
    const scope = new Function(`${defaultsSrc}\n${mergeFnSrc}\nreturn { DEFAULT_MODELS, mergeModelTable }`)()
    // TARGET's own defaults, not the `source` parsed above: with a second
    // argument the two are different files, and an assertion comparing the
    // merge of one against the table of the other proves nothing.
    defaults = scope.DEFAULT_MODELS
    merge = override => scope.mergeModelTable(defaults, override)
  } catch (e) {
    fatal(`mergeModelTable does not evaluate standalone (${e.message}) — this script's extraction is stale. Fix it before trusting a pass.`)
  }
}

const assert = (label, fn) => {
  if (!merge) {
    console.log(`✗ ${label} — could not run: mergeModelTable not extracted from ${target}`)
    problems.push(`${label}: could not run, mergeModelTable not extracted from ${target}`)
    return
  }
  let ok = false
  let detail = ''
  try {
    const r = fn(merge)
    ok = r?.ok === true
    detail = r?.detail ? ` — ${r.detail}` : ''
  } catch (e) {
    detail = ` — threw: ${e.message}`
  }
  console.log(`${ok ? '✓' : '✗'} ${label}${detail}`)
  if (!ok) problems.push(`${label}${detail}`)
}

assert('a partial override still routes every role', m => {
  const { table, warnings } = m({ medium: { coder: 'haiku', reviewer: 'opus' } })
  const undef = ROLES.filter(r => typeof table.medium?.[r] !== 'string')
  return {
    ok: undef.length === 0 && table.medium.coder === 'haiku' && table.medium.reviewer === 'opus' && warnings.length === 0,
    detail: undef.length ? `unrouted role(s): ${undef.join(', ')}` : `medium.coder = '${table.medium.coder}', all ${ROLES.length} roles routed`,
  }
})

assert('an invalid model value keeps the default and warns', m => {
  const { table, warnings } = m({ medium: { coder: 42 } })
  return {
    ok: table.medium.coder === defaults.medium.coder && warnings.length === 1,
    detail: `medium.coder = '${table.medium.coder}' (default '${defaults.medium.coder}'), ${warnings.length} warning(s)`,
  }
})

assert('an unknown role key warns instead of being dropped silently', m => {
  const { table, warnings } = m({ medium: { codr: 'haiku' } })
  return {
    ok: warnings.length === 1 && !('codr' in table.medium),
    detail: `${warnings.length} warning(s): ${warnings.join(' | ') || 'none'}`,
  }
})

assert('an unknown tier key warns instead of being dropped silently', m => {
  const { table, warnings } = m({ mediumm: {} })
  return {
    ok: warnings.length === 1 && !('mediumm' in table),
    detail: `${warnings.length} warning(s): ${warnings.join(' | ') || 'none'}`,
  }
})

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s) with the model routing table or its merge.`)
  process.exit(1)
}

console.log(`\n✓ The table matches everywhere and config.models merges per role (${target}).`)
NODE
