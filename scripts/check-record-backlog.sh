#!/usr/bin/env bash
# The Record phase publishes nothing to the outside world by default, and that
# default is load-bearing rather than tidy: the host safety classifier refuses
# the ATTEMPT at external publication, not its result, so a Recorder that runs
# one `gh` probe is ended before it writes the review report or the architecture
# doc — neither of which has anything to do with GitHub. Field report #4
# measured that three times in one session, each ending `record_status: failed`
# with no artifact at all.
#
# None of that is visible to node --check. A Recorder refused on every single
# run is syntactically perfect; a default flipped back to 'github' by a later
# edit is one word and looks exactly like a correct one; and a 'file' directive
# that says "prefer the file, but check `gh` first" reads as more careful while
# being the precise failure. So this drives the real declarations, brace-
# extracted out of workflows/ldo.js — nothing below is a copy of the source it
# checks — and asserts the default, the allowlist, and the two directives'
# wording as SEPARATELY NAMED assertions, so a failure says which one moved.
#
# markRecordFailed is asserted for reference identity on its no-op paths, the
# same property and the same reason as markFullSuite in check-scoped-tests.sh:
# call sites detect an annotation firing by identity, and it must never rewrite
# `status` — a dead Recorder says nothing about whether the code is any good.
#
# RECORD_SCHEMA's enum is read out of the source because the schema is the only
# thing that makes the Recorder's self-report checkable: without 'none' in it, a
# run with no backlog items cannot report honestly and picks one of the two
# destinations instead.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-change failure can be demonstrated without editing this script.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. They all validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-record-backlog.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')

// Same technique as check-verdict-gates.sh and check-scoped-tests.sh: find the
// declaration, then walk forward counting brackets until the first newline at
// depth zero. Covers both `const f = ...` arrows and `function f(...)` forms.
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

// The allowlist, the default and the directive texts are extracted rather than
// mirrored for the same reason check-scoped-tests.sh extracts SCOPED_RUNNERS:
// a literal copy here would leave every assertion green while the shipped
// default was 'github'.
const WANTED_CONSTS = ['BACKLOG_DESTINATIONS', 'DEFAULT_BACKLOG_DESTINATION', 'BACKLOG_KEYS', 'BACKLOG_DIRECTIVES']
const WANTED_FNS = ['resolveBacklogDestination', 'renderBacklogDirective', 'markRecordFailed']
const WANTED = [...WANTED_CONSTS, ...WANTED_FNS]
const problems = []
const sources = {}
for (const name of WANTED) {
  const body = extract(name)
  if (body) sources[name] = body
  else problems.push(`${name}: not found in ${target}. Either this source predates the file-by-default backlog (expected when pointing at a pre-change copy) or this script's extraction is stale — fix it before trusting a pass.`)
}

// Constants first so no extracted body sits in their temporal dead zone.
const found = [...WANTED_CONSTS, ...WANTED_FNS].filter(n => sources[n])
let scope = {}
try {
  scope = new Function(`${found.map(n => sources[n]).join('\n')}\nreturn { ${found.join(', ')} }`)()
} catch (e) {
  problems.push(`extracted declarations do not evaluate standalone (${e.message}) — this script's extraction is stale. Fix it before trusting a pass.`)
}

const assert = (label, deps, fn) => {
  const missing = deps.filter(d => !(d in scope))
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

// ── the default, one shape of "unset" per assertion ──
//
// Three separate assertions rather than one loop: an operator with no `backlog`
// block at all, one with an empty block, and one with a typo are three
// different routes to the same required answer, and a single loop reporting
// "one of three failed" would not say which route reopened.

assert("no config.backlog at all resolves to 'file'", ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination(undefined)
  return { ok: r.destination === 'file' && r.warnings.length === 0, detail: `destination = ${JSON.stringify(r.destination)}, ${r.warnings.length} warning(s)` }
})

assert("an empty config.backlog resolves to 'file' and warns about nothing", ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination({})
  return { ok: r.destination === 'file' && r.warnings.length === 0, detail: `destination = ${JSON.stringify(r.destination)}, ${r.warnings.length} warning(s)` }
})

assert("an invalid destination keeps 'file' and the warning names the key and the value", ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination({ destination: 'nope' })
  const w = r.warnings[0] || ''
  const ok = r.destination === 'file' && r.warnings.length === 1 && w.includes('config.backlog.destination') && w.includes('"nope"') && /file\|github/.test(w) && /Keeping default file/.test(w)
  return { ok, detail: `destination = ${JSON.stringify(r.destination)}, warning = ${JSON.stringify(w)}` }
})

// The classifier does not care that the operator meant to opt in, so a value
// that only looks like the opt-in must not be treated as one.
assert("a near-miss destination ('GitHub') is not honoured — the opt-in must be exact", ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination({ destination: 'GitHub' })
  return { ok: r.destination === 'file' && r.warnings.length === 1, detail: `destination = ${JSON.stringify(r.destination)}, ${r.warnings.length} warning(s)` }
})

assert("'github' is honoured when set exactly, and warns about nothing", ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination({ destination: 'github' })
  return { ok: r.destination === 'github' && r.warnings.length === 0, detail: `destination = ${JSON.stringify(r.destination)}, ${r.warnings.length} warning(s)` }
})

// A key guard, not only a value guard: without it the operator who wrote
// `{ backlog: { dest: 'github' } }` believes they opted in, and nothing in the
// log says otherwise. Same reasoning as the config.tests and config.stallMs
// key loops.
assert('an unknown key under config.backlog is named in a warning and ignored', ['resolveBacklogDestination'], s => {
  const r = s.resolveBacklogDestination({ destination: 'file', dest: 'github' })
  const w = r.warnings.find(x => x.includes('config.backlog.dest')) || ''
  const ok = r.destination === 'file' && r.warnings.length === 1 && /not a known key/.test(w) && /Keys: destination/.test(w)
  return { ok, detail: `warning = ${JSON.stringify(w)}` }
})

assert('the allowlist is exactly file and github, in that order', ['BACKLOG_DESTINATIONS', 'DEFAULT_BACKLOG_DESTINATION'], s => {
  const ok = JSON.stringify(s.BACKLOG_DESTINATIONS) === '["file","github"]' && s.DEFAULT_BACKLOG_DESTINATION === 'file'
  return { ok, detail: `${JSON.stringify(s.BACKLOG_DESTINATIONS)}, default ${JSON.stringify(s.DEFAULT_BACKLOG_DESTINATION)}` }
})

// ── the two directives ──
//
// The FILE directive is asserted for a prohibition AND for the absence of
// permission to check. "Prefer the file; use `gh` if it is available" would
// pass any test that only looked for the word 'file', and is exactly the
// wording that ended three Recorders.

assert('the FILE directive forbids running gh outright', ['renderBacklogDirective'], s => {
  const d = s.renderBacklogDirective('file')
  const ok = /^## BACKLOG DESTINATION — FILE/m.test(d) && /do not run/i.test(d) && /`gh`/.test(d) && /"file"/.test(d)
  return { ok, detail: `${d.split('\n')[0]}` }
})

assert('the FILE directive contains no fallback or availability-check wording', ['renderBacklogDirective'], s => {
  const d = s.renderBacklogDirective('file')
  const leaks = ['fall back', 'falls back', 'if available', 'if it works', 'if gh is available'].filter(p => d.toLowerCase().includes(p))
  return { ok: leaks.length === 0, detail: `${leaks.length} leak(s): ${JSON.stringify(leaks)}` }
})

assert('the GITHUB directive names the config key that opted in, and carries the fallback', ['renderBacklogDirective'], s => {
  const d = s.renderBacklogDirective('github')
  const ok = /^## BACKLOG DESTINATION — GITHUB/m.test(d) && d.includes('config.backlog.destination') && /fall back/i.test(d) && /"file"/.test(d)
  return { ok, detail: `${d.split('\n')[0]}` }
})

// An unresolvable value must not render an empty block: an empty string in the
// prompt is a Recorder with no destination rule at all, which is where it was
// before any of this.
// 'constructor' and friends are not paranoia: BACKLOG_DIRECTIVES is a plain
// object literal, so those names resolve through the prototype and a bare
// `[destination] ||` lookup returns an inherited function instead of falling
// back. 'nope' alone cannot see that hole — it is absent from the prototype too.
assert('an unrecognised destination still renders the FILE directive, never an empty block', ['renderBacklogDirective'], s => {
  const bad = ['nope', '', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']
  const file = s.renderBacklogDirective('file')
  const wrong = bad.filter(d => s.renderBacklogDirective(d) !== file)
  return { ok: wrong.length === 0, detail: wrong.length ? `not the FILE directive for: ${wrong.join(', ')}` : `all ${bad.length} unrecognised values render FILE (${file.length} chars)` }
})

// ── markRecordFailed ──

assert("CONTROL: markRecordFailed returns the identical object for 'ok'", ['markRecordFailed'], s => {
  const v = { status: 'approved', summary: 'fine' }
  return { ok: s.markRecordFailed(v, 'ok') === v, detail: `same reference = ${s.markRecordFailed(v, 'ok') === v}` }
})

assert("CONTROL: markRecordFailed returns the identical object for 'skipped'", ['markRecordFailed'], s => {
  const v = { status: 'approved', summary: 'fine' }
  return { ok: s.markRecordFailed(v, 'skipped') === v, detail: `same reference = ${s.markRecordFailed(v, 'skipped') === v}` }
})

assert("markRecordFailed annotates on 'failed' without touching status", ['markRecordFailed'], s => {
  const v = { status: 'approved', summary: 'fine' }
  const out = s.markRecordFailed(v, 'failed')
  const ok = out !== v && out.status === v.status && out.summary.startsWith('fine') && out.summary.includes('RECORD NOT PERSISTED') && v.summary === 'fine'
  return { ok, detail: `status = ${JSON.stringify(out.status)}, original untouched = ${v.summary === 'fine'}` }
})

assert("markRecordFailed does not turn a rejection into anything else", ['markRecordFailed'], s => {
  const v = { status: 'changes_requested', summary: 'two criticals' }
  const out = s.markRecordFailed(v, 'failed')
  return { ok: out.status === 'changes_requested', detail: `status = ${JSON.stringify(out.status)}` }
})

// ── RECORD_SCHEMA ──
//
// Read out of the source text rather than by extracting the whole schema: the
// enum is the only part of it this gate is about, and matching the property
// keeps the assertion from going green on an unrelated schema edit.
{
  const label = "RECORD_SCHEMA's backlog.destination enum is exactly file, github, none"
  const m = src.match(/destination:\s*\{\s*type:\s*'string',\s*enum:\s*(\[[^\]]*\])/)
  let ok = false
  let detail = 'no backlog.destination enum found in RECORD_SCHEMA'
  if (m) {
    try {
      const enumValue = new Function(`return ${m[1]}`)()
      ok = JSON.stringify(enumValue) === '["file","github","none"]'
      detail = JSON.stringify(enumValue)
    } catch (e) {
      detail = `enum did not parse: ${e.message}`
    }
  }
  console.log(`${ok ? '✓' : '✗'} ${label} — ${detail}`)
  if (!ok) problems.push(`${label} — ${detail}`)
}

// The directive has to actually reach the Recorder. A resolved constant nothing
// composes into recordPrompt is the same as no directive at all, and every
// assertion above would still pass.
{
  const label = 'the resolved directive is composed into the Record prompt'
  const start = src.indexOf('const recordPrompt =')
  const line = start < 0 ? '' : src.slice(start, src.indexOf('\n', start))
  const ok = start >= 0 && line.includes('renderBacklogDirective(BACKLOG_DESTINATION)')
  console.log(`${ok ? '✓' : '✗'} ${label} — ${ok ? line.trim().slice(0, 120) : 'renderBacklogDirective(BACKLOG_DESTINATION) is not in the recordPrompt composition'}`)
  if (!ok) problems.push(`${label}: renderBacklogDirective(BACKLOG_DESTINATION) is not composed into recordPrompt in ${target}.`)
}

if (problems.length) {
  console.error('\n✗ Record backlog check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ The Recorder publishes to a file unless the operator opted in, and a failed Record says so (${target}).`)
NODE
