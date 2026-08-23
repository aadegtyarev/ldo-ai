#!/usr/bin/env bash
# Every schema in the pipeline is sent to the harness as a tool definition, and
# the harness runs a safety classifier over it before the agent starts. A schema
# past that limit is rejected with "output schema too large to classify safely"
# — the run dies in ~12ms, spends zero tokens, and node --check plus
# check-model-table.sh both stay green. There is nothing to debug afterwards.
#
# This happened for real: PLAN_SCHEMA grew across three releases (migrations,
# problem_evidence, sizing) from 3198 to 4116 serialized chars and crossed the
# limit. It went unnoticed only because the installed plugin lagged the repo;
# the next restart broke every single run of the pipeline.
#
# The exact ceiling is the harness's and is not published, so this checks
# against the largest size known to WORK (3198, shipped in 2.25.0) plus a
# deliberately small margin. If you need to exceed it, the fix is to move the
# prose into the agent's markdown, where it costs nothing here.
#
# Usage: scripts/check-schema-size.sh [repo-root]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const LIMIT = 3400  // 3198 is proven to work; small margin, deliberately tight
const src = readFileSync('workflows/ldo.js', 'utf8')
const names = [...src.matchAll(/^const ([A-Z_]+_SCHEMA)\s*=/gm)].map(m => m[1])

if (!names.length) {
  console.error('error: no *_SCHEMA constants found in workflows/ldo.js — this script\'s regex is stale. Fix it before trusting a pass.')
  process.exit(1)
}

const problems = []
for (const name of names) {
  const i = src.indexOf(`const ${name}`)
  let depth = 0, end = -1
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}' && --depth === 0) { end = k + 1; break }
  }
  if (end === -1) { problems.push(`${name}: could not find its closing brace`); continue }
  let obj
  try { obj = new Function(src.slice(i, end) + `\nreturn ${name}`)() }
  catch (e) { problems.push(`${name}: does not evaluate standalone (${e.message})`); continue }
  const size = JSON.stringify(obj).length
  const flag = size > LIMIT ? '✗' : ' '
  console.log(`${flag} ${name.padEnd(18)} ${String(size).padStart(5)}`)
  if (size > LIMIT) {
    problems.push(`${name} is ${size} serialized chars, over the ${LIMIT} limit — the harness will reject it before the agent runs. Move description prose into the agent's markdown.`)
  }
}

if (problems.length) {
  console.error('\n✗ Schema size check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ All ${names.length} schemas within the ${LIMIT}-char classifier budget.`)
NODE
