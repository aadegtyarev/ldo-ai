#!/usr/bin/env bash
# The review loop can report a run approved when it plainly was not. Run
# wf_2b451aee-6ea did exactly that: both reviewer rounds came back
# changes_requested with verification.verdict 'failed' and 8 of 8 acceptance
# criteria failed, against a zero-line diff, and the pipeline printed APPROVED.
# Two independent defects had to line up. An issue's identity was the
# Reviewer's verbatim prose, so re-raising the same critical in different words
# produced a different key and downgradeUnrelatedFindings reclassified a live
# blocker as an unrelated advisory; and neither approval branch had ever read
# verification.verdict at all, so nothing else caught it.
#
# Both defects are invisible to node --check and to the other two gates — the
# code stayed syntactically perfect through the entire false approval. So this
# check drives the real functions, brace-extracted out of workflows/ldo.js,
# against scripts/fixtures/wf2b451aee-verdicts.json. That fixture holds that
# run's two verdicts; the two `what` strings in it are the genuine re-worded
# pair as the Reviewer wrote them, copied verbatim, not invented for the test.
# Its source lives under a gitignored directory, which is why the strings are
# committed here instead of read from it.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-fix failure can be demonstrated without editing this script.
#
# WHERE THIS LIVES: scripts/, beside the other two gates, and scripts/vendor.sh
# deliberately does not copy it. All three validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-verdict-gates.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')
const fixture = JSON.parse(readFileSync('scripts/fixtures/wf2b451aee-verdicts.json', 'utf8'))
const [round1, round2] = fixture

// Same technique as check-schema-size.sh: find the declaration, then walk
// forward counting brackets until the first newline at depth zero. Covers both
// `const f = ...` arrows and `function f(...)` declarations.
const extract = name => {
  const starts = [`const ${name} =`, `function ${name}(`].map(p => src.indexOf(p)).filter(i => i >= 0)
  if (!starts.length) return null
  const i = Math.min(...starts)
  let depth = 0
  for (let k = i; k < src.length; k++) {
    const c = src[k]
    if (c === '{' || c === '(' || c === '[') depth++
    else if (c === '}' || c === ')' || c === ']') depth--
    else if (c === '\n' && depth === 0) return src.slice(i, k)
  }
  return null
}

const WANTED = ['normalizeWhat', 'issueKey', 'matchIssueKey', 'downgradeUnrelatedFindings', 'enforceVerificationGate']
const problems = []
const sources = {}
for (const name of WANTED) {
  const body = extract(name)
  if (body) sources[name] = body
  else problems.push(`${name}: not found in ${target}. Either this source predates the fix (expected when pointing at a pre-fix copy) or this script's extraction is stale — fix it before trusting a pass.`)
}

// A pre-fix source is missing the helpers entirely, so every assertion below
// would report "could not run" and the operator would see broken plumbing
// rather than the defect. Reconstruct what that source actually did — identity
// is the Reviewer's verbatim prose, no verification gate at all — and drive the
// fixture through it, so pointing this script at `git show HEAD:workflows/ldo.js`
// prints the false approval itself. Diagnostic only: `problems` is already
// populated and the run still exits non-zero.
if (!sources.issueKey && sources.downgradeUnrelatedFindings) {
  try {
    const legacy = new Function(
      `const BLOCKING_SEVERITIES = ['critical', 'major']\n${sources.downgradeUnrelatedFindings}\nreturn downgradeUnrelatedFindings`,
    )()
    const key = i => `${i.file}::${i.what}`
    const { verdict, downgraded } = legacy({ ...round2, status: 'approved' }, round1.issues, 1)
    const blocking = (verdict.issues || []).filter(i => ['critical', 'major'].includes(i.severity) && !downgraded.has(key(i)))
    console.log(`  ↳ pre-fix behaviour of ${target}: downgraded ${downgraded.size}, blocking ${blocking.length}, verification.verdict '${round2.verification?.verdict}' — approved: ${blocking.length === 0}`)
  } catch (e) {
    problems.push(`could not reconstruct the pre-fix behaviour of ${target} (${e.message}) — this script's extraction is stale.`)
  }
}

// A factory rather than one scope, so an assertion can vary BLOCKING_SEVERITIES:
// it is operator-configurable via config.blockingSeverities, and the injected
// gate issue must keep working for a project that does not list 'critical'.
const found = Object.keys(sources)
const scopeFor = blockingSeverities => {
  const preamble = `const BLOCKING_SEVERITIES = ${JSON.stringify(blockingSeverities)}\nconst ISSUE_MATCH_THRESHOLD = 0.45\n`
  const body = found.map(n => sources[n]).join('\n')
  return new Function(`${preamble}${body}\nreturn { ${found.join(', ')} }`)()
}

let scope = {}
try {
  scope = scopeFor(['critical', 'major'])
} catch (e) {
  problems.push(`extracted functions do not evaluate standalone (${e.message}) — this script's extraction is stale. Fix it before trusting a pass.`)
}

const assert = (label, deps, fn) => {
  const missing = deps.filter(d => !scope[d])
  if (missing.length) {
    console.log(`✗ ${label} — could not run: ${missing.join(', ')} not extracted`)
    problems.push(`${label}: could not run, ${missing.join(', ')} not extracted`)
    return
  }
  let ok = false
  let detail = ''
  try {
    const r = fn(scope)
    ok = r === true || r?.ok === true
    detail = typeof r === 'object' && r?.detail ? ` — ${r.detail}` : ''
  } catch (e) {
    detail = ` — threw: ${e.message}`
  }
  console.log(`${ok ? '✓' : '✗'} ${label}${detail}`)
  if (!ok) problems.push(`${label}${detail}`)
}

// The composition both approval branches in phaseCodeReview perform, kept in
// one place so an assertion can re-run it under a different severity config.
const compose = (s, verdict, sentIssues, iteration) => {
  const { verdict: downgradedVerdict, downgraded } = s.downgradeUnrelatedFindings(verdict, sentIssues, iteration)
  const gated = s.enforceVerificationGate(downgradedVerdict)
  const verificationBlocked = gated !== downgradedVerdict
  const issues = gated.issues || []
  const blocking = issues.filter(i => s.BLOCKING.includes(i.severity) && !downgraded.has(s.issueKey(i)))
  const approved = gated.status === 'approved' || (blocking.length === 0 && !verificationBlocked)
  return { downgraded, gated, blocking, verificationBlocked, approved }
}

assert('round 2 re-raise matches round 1 sent key, so nothing is downgraded', ['downgradeUnrelatedFindings', 'issueKey'], s => {
  const { downgraded } = s.downgradeUnrelatedFindings(round2, round1.issues, 1)
  return { ok: downgraded.size === 0, detail: `downgraded.size = ${downgraded.size}, expected 0` }
})

assert('the re-raised critical still counts as blocking', ['downgradeUnrelatedFindings', 'issueKey'], s => {
  const { verdict, downgraded } = s.downgradeUnrelatedFindings(round2, round1.issues, 1)
  const blocking = (verdict.issues || []).filter(i => ['critical', 'major'].includes(i.severity) && !downgraded.has(s.issueKey(i)))
  return { ok: blocking.length === 1, detail: `blocking = ${blocking.length}, expected 1` }
})

assert("enforceVerificationGate rewrites an 'approved' verdict with failed verification", ['enforceVerificationGate'], s => {
  const claimed = { ...round2, status: 'approved' }
  const gated = s.enforceVerificationGate(claimed)
  const ok = gated !== claimed && gated.status === 'changes_requested' && (gated.issues || []).some(i => i.file === 'verification' && i.severity === 'critical')
  return { ok, detail: `status = ${gated.status}` }
})

assert('both approval branches refuse the run', ['downgradeUnrelatedFindings', 'issueKey', 'enforceVerificationGate'], s => {
  const r = compose({ ...s, BLOCKING: ['critical', 'major'] }, { ...round2, status: 'approved' }, round1.issues, 1)
  return { ok: r.approved === false, detail: `approved = ${r.approved}, blocking = ${r.blocking.length}, verificationBlocked = ${r.verificationBlocked}` }
})

assert("the gate holds when 'critical' is not a blocking severity", ['downgradeUnrelatedFindings', 'issueKey', 'enforceVerificationGate'], () => {
  const s = scopeFor(['major'])
  const r = compose({ ...s, BLOCKING: ['major'] }, { ...round2, status: 'approved' }, round1.issues, 1)
  return { ok: r.approved === false, detail: `approved = ${r.approved}, blocking = ${r.blocking.length}` }
})

assert('CONTROL: an unrelated new critical on the same file is still downgraded', ['downgradeUnrelatedFindings'], s => {
  const unrelated = {
    ...round2,
    issues: [{ file: 'workflows/ldo.js', severity: 'critical', what: 'The stall watchdog timeout is hard-coded and ignores per-role stallMs configuration entirely.', suggestion: 'x', introduced_by_fix: false }],
  }
  const { downgraded } = s.downgradeUnrelatedFindings(unrelated, round1.issues, 1)
  return { ok: downgraded.size === 1, detail: `downgraded.size = ${downgraded.size}, expected 1` }
})

// The enum and the criteria list are written by the same model in one object
// and nothing makes them agree. Reading the word alone approved this shape.
assert("a self-contradicting 'verified' with a failed criterion still blocks", ['enforceVerificationGate'], s => {
  const contradiction = { status: 'approved', summary: 'x', verification: { verdict: 'verified', criteria: [{ criterion: 'c1', status: 'passed' }, { criterion: 'c2', status: 'failed' }] } }
  const gated = s.enforceVerificationGate(contradiction)
  const ok = gated !== contradiction && gated.status === 'changes_requested'
  return { ok, detail: `status = ${gated.status}, gate fired = ${gated !== contradiction}` }
})

assert("the same contradiction under 'nothing_to_drive' also blocks", ['enforceVerificationGate'], s => {
  const contradiction = { status: 'approved', summary: 'x', verification: { verdict: 'nothing_to_drive', criteria: [{ criterion: 'c1', status: 'failed' }] } }
  const gated = s.enforceVerificationGate(contradiction)
  return { ok: gated !== contradiction && gated.status === 'changes_requested', detail: `status = ${gated.status}` }
})

// The pass path must stay reference-identical: the call site detects firing by
// identity, so a spread here would mark every clean run blocked forever.
assert("CONTROL: 'nothing_to_drive' with no failed criteria still passes by reference", ['enforceVerificationGate'], s => {
  const docsOnly = { status: 'approved', summary: 'docs', verification: { verdict: 'nothing_to_drive', criteria: [] } }
  const gated = s.enforceVerificationGate(docsOnly)
  return { ok: gated === docsOnly, detail: `same reference = ${gated === docsOnly}` }
})

assert('CONTROL: a verified verdict with no issues is still approved', ['downgradeUnrelatedFindings', 'issueKey', 'enforceVerificationGate'], s => {
  const clean = { status: 'approved', summary: 'clean', issues: [], verification: { verdict: 'verified', criteria: [{ criterion: 'c1', status: 'passed' }] } }
  const r = compose({ ...s, BLOCKING: ['critical', 'major'] }, clean, [], 1)
  return { ok: r.approved === true, detail: `approved = ${r.approved}` }
})

// The verification-log block reads the same model-authored object through the
// alias `const v = verdict.verification`, which hides it from any enumeration
// grepping for `verification?.criteria`. `?.` guards null but not type: a
// string `criteria` reaches .filter and throws, and `blockers: 'none'` has a
// truthy .length and throws on .join. A verdict whose word is 'verified'
// passes enforceVerificationGate by reference and lands here, so the throw
// aborts the run after the review already succeeded. Driven as the real
// extracted block rather than asserted by reading it.
const logBlock = (() => {
  const marks = []
  let idx = -1
  while ((idx = src.indexOf('const v = verdict.verification', idx + 1)) >= 0) marks.push(idx)
  if (marks.length < 2) return null // the first is enforceVerificationGate's own
  const start = src.indexOf('if (v) {', marks[marks.length - 1])
  if (start < 0) return null
  let depth = 0
  for (let k = start; k < src.length; k++) {
    const c = src[k]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, k + 1) }
  }
  return null
})()

const driveLog = v => {
  const lines = []
  new Function('v', 'log', 'logPrefix', logBlock)(v, m => lines.push(m), '')
  return lines
}

const logAssert = (label, fn) => {
  if (!logBlock) {
    console.log(`✗ ${label} — could not run: verification log block not extracted`)
    problems.push(`${label}: could not run, verification log block not extracted from ${target}`)
    return
  }
  let ok = false
  let detail = ''
  try {
    const r = fn()
    ok = r === true || r?.ok === true
    detail = typeof r === 'object' && r?.detail ? ` — ${r.detail}` : ''
  } catch (e) {
    detail = ` — threw: ${e.message}`
  }
  console.log(`${ok ? '✓' : '✗'} ${label}${detail}`)
  if (!ok) problems.push(`${label}${detail}`)
}

logAssert("the verification log survives a criteria that is a string, not an array", () => {
  const lines = driveLog({ verdict: 'verified', criteria: 'oops' })
  return { ok: lines.length === 1, detail: JSON.stringify(lines) }
})

logAssert("the verification log survives blockers that is a string, not an array", () => {
  const lines = driveLog({ verdict: 'failed', criteria: [], blockers: 'nope' })
  return { ok: !lines.some(l => l.includes('Blockers')), detail: JSON.stringify(lines) }
})

logAssert("the verification log survives a null entry inside a well-formed criteria array", () => {
  const lines = driveLog({ verdict: 'partial', criteria: [null, { criterion: 'c2', status: 'failed' }] })
  return { ok: lines.some(l => l.includes('c2')), detail: JSON.stringify(lines) }
})

logAssert("CONTROL: a well-formed verification still logs counts, failures and blockers", () => {
  const lines = driveLog({ verdict: 'verified', criteria: [{ criterion: 'c1', status: 'passed' }, { criterion: 'c2', status: 'failed', note: 'n' }], blockers: ['b1'] })
  const ok = lines[0].includes('1/2 criteria proven') && lines.some(l => l.includes('✗ c2 — n')) && lines.some(l => l.includes('⚠ Blockers: b1'))
  return { ok, detail: JSON.stringify(lines) }
})

if (problems.length) {
  console.error('\n✗ Verdict gate check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ A re-worded re-raise still blocks and a failed verification cannot be approved (${target}).`)
NODE
