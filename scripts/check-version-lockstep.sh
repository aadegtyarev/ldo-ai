#!/usr/bin/env bash
# LDO's version lives in five places and every one of them is hand-edited on a
# release: `LDO_VERSION` in workflows/ldo.js, one field in
# .claude-plugin/plugin.json, THREE in .claude-plugin/marketplace.json, the
# `<!-- ldo:version -->` stamp skills/ldo-init writes into a project's
# CLAUDE.md, and the newest CHANGELOG heading. Five copies bumped by hand is
# four opportunities to bump four of them.
#
# The stamp is why this matters beyond tidiness. Issue #20's standing complaint
# was that the CLAUDE.md block goes stale after a plugin update with nothing
# able to tell: the block written by 2.31.0 is byte-indistinguishable from a
# current one. The fix is the stamp plus the version the run logs, and that
# comparison is worth exactly nothing if the two are allowed to drift here. The
# stamp is a hint for the operator to re-run /ldo-init, never a check — nothing
# in workflows/ldo.js reads or branches on it — so this script is the only thing
# keeping it honest.
#
# Marketplace.json's count is asserted, not just its values: a fourth `version`
# added later would otherwise be silently unchecked, which is the same defect
# one level up.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-change failure can be demonstrated without editing this script. A source
# with no LDO_VERSION at all fails at the first assertion, which is precisely
# the state this gate was added to end.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. They all validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-version-lockstep.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')

const problems = []
const report = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

// Read out of the source text, never mirrored here: a literal '2.37.0' in this
// script would keep every assertion below green while the shipped constant said
// something else, which is the whole failure this gate exists to catch.
const m = src.match(/const LDO_VERSION = '([^']*)'/)
const SOURCE_OF_TRUTH = m ? m[1] : null

report(
  !!SOURCE_OF_TRUTH && /^\d+\.\d+\.\d+$/.test(SOURCE_OF_TRUTH),
  'LDO_VERSION is declared in the source and is a semver triple',
  SOURCE_OF_TRUTH === null
    ? `no \`const LDO_VERSION = '…'\` in ${target}. Either this source predates the version constant (expected when pointing at a pre-change copy) or it was removed — the ldo:version stamp is unverifiable either way.`
    : JSON.stringify(SOURCE_OF_TRUTH)
)

// Every copy is compared through this one function so the CONTROL at the bottom
// exercises the same comparison the real assertions do, rather than a
// re-implementation that could agree with a broken original.
const collect = () => {
  const found = []
  const json = path => JSON.parse(readFileSync(path, 'utf8'))

  found.push({ where: '.claude-plugin/plugin.json version', values: [json('.claude-plugin/plugin.json').version] })

  const marketplace = json('.claude-plugin/marketplace.json')
  const versions = []
  const walk = node => {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (!node || typeof node !== 'object') return
    for (const [k, v] of Object.entries(node)) {
      if (k === 'version' && typeof v === 'string') versions.push(v)
      else walk(v)
    }
  }
  walk(marketplace)
  found.push({ where: '.claude-plugin/marketplace.json version fields', values: versions, expectedCount: 3 })

  const skill = readFileSync('skills/ldo-init/SKILL.md', 'utf8')
  // Inside the fenced block only: the stamp is what /ldo-init writes into a
  // project, and a copy in the prose above it would prove nothing.
  const fence = skill.match(/```markdown\n<!-- BEGIN ldo -->[\s\S]*?<!-- END ldo -->\n```/)
  const stamp = fence ? fence[0].match(/<!-- ldo:version ([^\s]+) -->/) : null
  found.push({ where: 'skills/ldo-init/SKILL.md <!-- ldo:version --> stamp (inside the fenced block)', values: stamp ? [stamp[1]] : [] , expectedCount: 1 })

  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const heading = changelog.match(/^## \[([^\]]+)\]/m)
  found.push({ where: 'CHANGELOG.md newest ## [version] heading', values: heading ? [heading[1]] : [], expectedCount: 1 })

  return found
}

const compare = version => {
  const results = []
  for (const copy of collect()) {
    const countOk = copy.expectedCount === undefined || copy.values.length === copy.expectedCount
    const valuesOk = copy.values.length > 0 && copy.values.every(v => v === version)
    results.push({ ...copy, ok: countOk && valuesOk, countOk })
  }
  return results
}

if (SOURCE_OF_TRUTH) {
  for (const r of compare(SOURCE_OF_TRUTH)) {
    const detail = r.countOk
      ? `${JSON.stringify(r.values)} vs LDO_VERSION ${JSON.stringify(SOURCE_OF_TRUTH)}`
      : `found ${r.values.length} version field(s), expected ${r.expectedCount} — a copy was added or removed without this gate learning about it: ${JSON.stringify(r.values)}`
    report(r.ok, `${r.where} matches LDO_VERSION`, detail)
  }
} else {
  report(false, 'the four copies could not be compared', 'LDO_VERSION was not found, so there is nothing to compare them against')
}

// CONTROL — a gate that cannot fail is not a gate. The same comparison, handed
// a version no copy carries, must report every copy as disagreeing.
{
  const bogus = '0.0.0-not-a-real-version'
  const results = compare(bogus)
  const agreeing = results.filter(r => r.ok)
  report(agreeing.length === 0, 'CONTROL: a source claiming a different LDO_VERSION is reported as a mismatch by every copy',
    agreeing.length ? `${agreeing.length} copy(ies) still reported as matching ${bogus}` : `all ${results.length} copies disagree with ${bogus}, as they must`)
}

if (problems.length) {
  console.error('\n✗ Version lockstep check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  console.error('\n  All five copies move together: LDO_VERSION, plugin.json, marketplace.json (x3),')
  console.error('  the ldo:version stamp in skills/ldo-init/SKILL.md, and the newest CHANGELOG heading.')
  process.exit(1)
}
console.log(`\n✓ All five version copies agree (${target}).`)
NODE
