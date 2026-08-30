#!/usr/bin/env bash
# /ldo-contract states three conventions — ≤200 characters per entry,
# provenance in a trailing `## Sources` section rather than an inline
# `(Source: …)` tail, one rule per line — and until this script nothing
# measured any of them. The cost of that is not stylistic: the Planner copies
# contract entries verbatim into `plan.risks`, and renderConstraints re-renders
# that block into BOTH the Coder's and the Reviewer's fix-pass prompt on every
# round. A 59 KB entry is therefore paid for up to six times in one run. Field
# report #4 measured a host contracts directory at 94 KB across five files with
# zero `## Sources` sections.
#
# WHAT THIS CANNOT COVER, stated plainly so nobody mistakes a green run for a
# guarantee: it measures THIS repository's own `docs/contracts/` only. LDO
# structurally cannot audit a host project's contracts from inside the
# pipeline — the workflow has no filesystem access, and only the agents it
# spawns can read files, by which point the entries are already in the prompt.
# The host-side signal is the truncation log line renderConstraints emits when
# it trims an over-long entry, not a check here that would only ever pass.
#
# A missing `## Sources` section WARNS rather than fails: a contract with no
# provenance is legitimate — sometimes the operator simply decided — whereas an
# entry over the limit or carrying an inline source tail is a measured, repeated
# cost. The per-file entry count and byte total print on success so that cost
# stays visible instead of accumulating unnoticed.
#
# This script reads the files as data. It never executes anything it reads, and
# the only path it takes from an argument is the directory to scan.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. They all validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-contracts.sh [repo-root] [contracts-dir]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
CONTRACTS_DIR="${2:-docs/contracts}"

CONTRACTS_DIR="$CONTRACTS_DIR" node --input-type=module <<'NODE'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const dir = process.env.CONTRACTS_DIR
const ENTRY_MAX = 200

let files = []
try {
  files = readdirSync(dir).filter(f => f.endsWith('.md')).sort()
} catch (e) {
  // Not a failure: a project with no contracts is a normal project, and this
  // gate has nothing to say about it. Anything other than "no such directory"
  // is a real problem and must not be swallowed into the same silence.
  if (e.code === 'ENOENT') {
    console.log(`✓ No ${dir}/ in this repo — nothing to measure.`)
    process.exit(0)
  }
  console.error(`✗ Could not read ${dir}/: ${e.message}`)
  process.exit(1)
}

if (!files.length) {
  console.log(`✓ ${dir}/ contains no .md files — nothing to measure.`)
  process.exit(0)
}

const problems = []
const warnings = []
let totalEntries = 0
let totalBytes = 0

for (const file of files) {
  const path = join(dir, file)
  const text = readFileSync(path, 'utf8')
  const bytes = statSync(path).size
  const lines = text.split('\n')

  // `^- [` is the entry shape /ldo-contract prescribes: a bullet opening with a
  // bracketed date. Prose, headings and the `## Sources` body are deliberately
  // not measured — this repo's own code.md carries a 222-character Sources
  // paragraph that is read once, when the operator audits, and never re-sent.
  const entries = []
  lines.forEach((line, i) => {
    if (!line.startsWith('- [')) return
    entries.push({ n: i + 1, line })
    if (line.length > ENTRY_MAX) {
      problems.push(`${path}:${i + 1} — entry is ${line.length} characters, over the ${ENTRY_MAX}-character limit. State the rule, not the reasoning; see /ldo-contract.`)
    }
    if (line.includes('(Source:')) {
      problems.push(`${path}:${i + 1} — entry carries an inline "(Source: …)" tail. Provenance belongs in a trailing "## Sources" section: an inline tail is re-sent into every downstream prompt for the rest of the run.`)
    }
  })

  if (entries.length && !/^## Sources\s*$/m.test(text)) {
    warnings.push(`${path} — ${entries.length} entry(ies) and no "## Sources" section. Legitimate if the operator simply decided, but provenance is what makes a contract auditable later.`)
  }

  totalEntries += entries.length
  totalBytes += bytes
  const longest = entries.reduce((m, e) => Math.max(m, e.line.length), 0)
  console.log(`  ${path} — ${entries.length} entry(ies), ${bytes} bytes, longest entry ${longest} chars`)
}

console.log(`  TOTAL — ${totalEntries} entry(ies) across ${files.length} file(s), ${totalBytes} bytes. This is re-read on every run that touches these areas.`)

warnings.forEach(w => console.log(`⚠ ${w}`))

if (problems.length) {
  console.error(`\n✗ Contract check failed:\n`)
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ Every contract entry fits ${ENTRY_MAX} characters and keeps its provenance out of the rule line (${dir}/).`)
NODE
