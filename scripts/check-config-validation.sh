#!/usr/bin/env bash
# `config.blockingSeverities` is the one config key whose failure direction is a
# green run over real defects. Every other bad value degrades a run loudly — a
# bad `tests.scope` falls back to the full suite, a bad `backlog.destination`
# writes a file — but this one decides which review issues hold the fix loop, so
# a value nothing recognises makes `isBlocking` false for EVERY issue. The
# review reports `N issue(s): 0 blocking`, the loop ends on its first pass, and
# the run reports approved with its criticals intact. `["Critical","Major"]` is
# enough to do it, because VERDICT_SCHEMA constrains severity to lowercase, and
# so is the misspelling `blockingSeverity`, which was read by nobody and
# reported by nobody: the nested blocks (planner, tests, backlog, design,
# stallMs) each warn on an unrecognised key, and README promises that behaviour
# three times, but the TOP level had no such loop at all.
#
# None of that is visible to node --check, and none of it is visible in a run
# log either — a false approval and a real one print the same line. So this
# drives the real declarations, brace-extracted out of workflows/ldo.js —
# nothing below is a copy of the source it checks — with one SEPARATELY NAMED
# assertion per shape of wrong value, so a failure says which route reopened
# rather than "one of fourteen".
#
# Three properties are asserted that a behavioural test would otherwise miss:
#
# (1) The severity allowlist is READ from VERDICT_SCHEMA rather than restated,
# so a severity added to the schema cannot be rejected here by a second copy
# nobody updated — and the resolver is additionally driven with that allowlist
# emptied, because the safe direction for a schema refactor that yields nothing
# is warn-and-keep-the-default, never honour-whatever-is-left.
#
# (2) `critical` is asserted non-removable. A list that is entirely valid but
# omits it — `["nit"]` — passes every enum check there is and still makes every
# critical advisory, and a warning-only response to that is indistinguishable
# from the defect by any gate, because a warning is transient while the run's
# `result` (what /ldo-ship and the operator's tracking entry read) would carry
# no trace of a gate narrowed to nothing.
#
# (3) No warning may carry a newline. CONFIG is composed from CLAUDE.md, which
# on a contributed branch or a vendored copy is repo content, so a rejected
# entry or a key name spelled `\n## ISSUES` forges a section header in a log the
# operator reads as orchestrator output — the class workflows/ldo.js already
# documents beside contractWarnings.
#
# Two source-level assertions cover what behaviour cannot see: a resolver
# nothing calls is exactly the defect this gate exists for.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-change failure can be demonstrated without editing this script.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. They all validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-config-validation.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')

// Same technique as check-record-backlog.sh: find the declaration, then walk
// forward counting brackets until the first newline at depth zero. Covers both
// `const f = ...` arrows and `function f(...)` forms.
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

// VERDICT_SCHEMA is extracted rather than mirrored because it is the single
// source of truth this gate is about: a literal copy here would keep every
// assertion green while the shipped allowlist and the shipped schema disagreed,
// which is the exact drift the derivation exists to prevent.
const WANTED_CONSTS = ['VERDICT_SCHEMA', 'LINE_BREAK_RUN', 'PROMPT_TEXT_MAX', 'collapseLines', 'RENDER_LIST_MAX', 'capList', 'SEVERITY_VALUES', 'DEFAULT_BLOCKING_SEVERITIES', 'CONFIG_KEYS']
const WANTED_FNS = ['resolveBlockingSeverities', 'unknownConfigKeys']
const WANTED = [...WANTED_CONSTS, ...WANTED_FNS]
const problems = []
const sources = {}
for (const name of WANTED) {
  const body = extract(name)
  if (body) sources[name] = body
  else problems.push(`${name}: not found in ${target}. Either this source predates config validation (expected when pointing at a pre-change copy) or this script's extraction is stale — fix it before trusting a pass.`)
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

const FULL_DEFAULT = '["critical","major"]'

// ── the allowlist comes from the schema, not from a second copy ──

assert('SEVERITY_VALUES is exactly the VERDICT_SCHEMA severity enum', ['SEVERITY_VALUES', 'VERDICT_SCHEMA'], s => {
  const fromSchema = s.VERDICT_SCHEMA?.properties?.issues?.items?.properties?.severity?.enum
  const ok = Array.isArray(fromSchema) && JSON.stringify(s.SEVERITY_VALUES) === JSON.stringify(fromSchema) && fromSchema.length > 0
  return { ok, detail: `SEVERITY_VALUES = ${JSON.stringify(s.SEVERITY_VALUES)}, schema enum = ${JSON.stringify(fromSchema)}` }
})

assert('the schema enum is lowercase throughout — the case mismatch is the whole defect', ['SEVERITY_VALUES'], s => {
  const bad = s.SEVERITY_VALUES.filter(v => typeof v !== 'string' || v !== v.toLowerCase())
  return { ok: bad.length === 0 && s.SEVERITY_VALUES.includes('critical'), detail: bad.length ? `not lowercase: ${JSON.stringify(bad)}` : JSON.stringify(s.SEVERITY_VALUES) }
})

// A schema refactor that leaves the enum unreadable must fail toward the full
// default. An empty allowlist that warns and defaults is safe; one that honours
// whatever is left rejects every configured value and blocks on nothing.
{
  const label = 'an EMPTY allowlist rejects every configured value and keeps the full default'
  const deps = ['LINE_BREAK_RUN', 'PROMPT_TEXT_MAX', 'collapseLines', 'RENDER_LIST_MAX', 'capList', 'DEFAULT_BLOCKING_SEVERITIES', 'resolveBlockingSeverities']
  const missing = deps.filter(d => !(d in sources))
  if (missing.length) {
    console.log(`✗ ${label} — could not run: ${missing.join(', ')} not extracted`)
    problems.push(`${label}: could not run, ${missing.join(', ')} not extracted`)
  } else {
    let ok = false
    let detail = ''
    try {
      const body = ['LINE_BREAK_RUN', 'PROMPT_TEXT_MAX', 'collapseLines', 'RENDER_LIST_MAX', 'capList'].map(n => sources[n]).join('\n')
        + '\nconst SEVERITY_VALUES = []\n'
        + sources['DEFAULT_BLOCKING_SEVERITIES'] + '\n' + sources['resolveBlockingSeverities']
        + '\nreturn resolveBlockingSeverities'
      const resolve = new Function(body)()
      const r = resolve(['critical', 'major'])
      ok = JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1
      detail = `severities = ${JSON.stringify(r.severities)}, ${r.warnings.length} warning(s)`
    } catch (e) {
      detail = `threw: ${e.message}`
    }
    console.log(`${ok ? '✓' : '✗'} ${label} — ${detail}`)
    if (!ok) problems.push(`${label} — ${detail}`)
  }
}

// ── one named assertion per shape of wrong value ──

assert('no config.blockingSeverities at all keeps the default silently', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(undefined)
  return { ok: JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 0, detail: `${JSON.stringify(r.severities)}, ${r.warnings.length} warning(s)` }
})

assert('a wrong-case list keeps the FULL default and the warning names the rejected values', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['Critical', 'Major'])
  const w = r.warnings[0] || ''
  const ok = JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1 && w.includes('"Critical"') && w.includes('"Major"') && /lowercase/.test(w)
  return { ok, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(w)}` }
})

assert('a bare string is not treated as a one-element list', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities('critical')
  const w = r.warnings[0] || ''
  const ok = JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1 && /expected an array/.test(w)
  return { ok, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(w)}` }
})

assert('an empty list keeps the default and the warning says nothing would block', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities([])
  const w = r.warnings[0] || ''
  const ok = JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1 && /nothing would block/.test(w)
  return { ok, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(w)}` }
})

// The valid remainder is deliberately NOT honoured: `['critical','blocker']`
// resolving to `['critical']` would silently narrow the gate to something the
// operator never wrote, and reads identically to a deliberate narrowing.
assert('one unrecognised entry rejects the whole list, never the valid remainder', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['critical', 'blocker'])
  const w = r.warnings[0] || ''
  const ok = JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1 && w.includes('"blocker"')
  return { ok, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(w)}` }
})

assert('a non-string entry is rejected too, and quoted rather than pasted', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities([{ severity: 'critical' }])
  return { ok: JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 1, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(r.warnings[0] || '')}` }
})

// ── `critical` is not removable ──
//
// A list that is entirely valid but omits `critical` passes every enum check
// and still makes every critical advisory. A log line about it is not
// distinguishable from the defect by any gate, so the resolver overrides.

assert("a valid list omitting 'critical' is overridden, not honoured", ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['nit'])
  const w = r.warnings[0] || ''
  const ok = r.severities.includes('critical') && r.severities.includes('nit') && r.warnings.length === 1 && /overridden/.test(w)
  return { ok, detail: `${JSON.stringify(r.severities)}, warning = ${JSON.stringify(w)}` }
})

assert("['major'] alone still blocks on criticals", ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['major'])
  return { ok: r.severities.includes('critical') && r.severities.includes('major'), detail: JSON.stringify(r.severities) }
})

// ── CONTROLs: a deliberate, well-formed narrowing is honoured unchanged ──

assert("CONTROL: ['critical'] is honoured with no warning at all", ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['critical'])
  return { ok: JSON.stringify(r.severities) === '["critical"]' && r.warnings.length === 0, detail: `${JSON.stringify(r.severities)}, ${r.warnings.length} warning(s)` }
})

assert('CONTROL: a valid four-value list is honoured and every severity blocks', ['resolveBlockingSeverities', 'SEVERITY_VALUES'], s => {
  const r = s.resolveBlockingSeverities([...s.SEVERITY_VALUES])
  return { ok: JSON.stringify(r.severities) === JSON.stringify(s.SEVERITY_VALUES) && r.warnings.length === 0, detail: JSON.stringify(r.severities) }
})

assert('CONTROL: a duplicated entry is deduped rather than rejected', ['resolveBlockingSeverities'], s => {
  const r = s.resolveBlockingSeverities(['critical', 'major', 'critical'])
  return { ok: JSON.stringify(r.severities) === FULL_DEFAULT && r.warnings.length === 0, detail: `${JSON.stringify(r.severities)}, ${r.warnings.length} warning(s)` }
})

assert('CONTROL: the resolver never returns an empty list, whatever it is given', ['resolveBlockingSeverities'], s => {
  const inputs = [undefined, null, '', 'critical', 0, 42, true, [], {}, [''], ['Critical'], ['nit'], [null], [undefined], ['critical']]
  const empty = inputs.filter(v => {
    try {
      const r = s.resolveBlockingSeverities(v)
      return !Array.isArray(r?.severities) || r.severities.length === 0 || !r.severities.includes('critical')
    } catch {
      return true
    }
  })
  return { ok: empty.length === 0, detail: empty.length ? `${empty.length} input(s) blocked on nothing or threw` : `all ${inputs.length} inputs keep 'critical' blocking` }
})

// ── the top-level key allowlist ──

assert('a misspelled blockingSeverity is named in a warning instead of being dropped', ['unknownConfigKeys'], s => {
  const w = s.unknownConfigKeys({ blockingSeverity: ['critical'] })
  const ok = w.length === 1 && w[0].includes('config.blockingSeverity') && /not a known key/.test(w[0])
  return { ok, detail: JSON.stringify(w) }
})

assert('a wrong-case maxfixloops is named too — the allowlist is exact', ['unknownConfigKeys'], s => {
  const w = s.unknownConfigKeys({ maxfixloops: 2 })
  return { ok: w.length === 1 && w[0].includes('config.maxfixloops'), detail: JSON.stringify(w) }
})

assert('a config that is not an object says every setting is being ignored', ['unknownConfigKeys'], s => {
  const w = s.unknownConfigKeys('models')
  return { ok: w.length === 1 && /not an object/.test(w[0]), detail: JSON.stringify(w) }
})

assert('CONTROL: every real top-level key produces zero warnings', ['unknownConfigKeys', 'CONFIG_KEYS'], s => {
  const cfg = Object.fromEntries(s.CONFIG_KEYS.map(k => [k, 1]))
  const w = s.unknownConfigKeys(cfg)
  return { ok: w.length === 0, detail: w.length ? JSON.stringify(w) : `${s.CONFIG_KEYS.length} keys, no warning` }
})

assert('CONTROL: no config at all produces zero warnings', ['unknownConfigKeys'], s => {
  const w = [...s.unknownConfigKeys(undefined), ...s.unknownConfigKeys(null), ...s.unknownConfigKeys({})]
  return { ok: w.length === 0, detail: JSON.stringify(w) }
})

// ldo-config.example.json is the file operators copy into their CLAUDE.md. An
// allowlist that fires on it teaches the operator that the warning means
// nothing, so the `_` exemption is asserted against the real file rather than
// against a fixture that would drift from it.
assert("CONTROL: the real ldo-config.example.json warns about nothing — `_`-prefixed pseudo-comments included", ['unknownConfigKeys'], s => {
  const example = JSON.parse(readFileSync('ldo-config.example.json', 'utf8'))
  const w = s.unknownConfigKeys(example)
  const underscored = Object.keys(example).filter(k => k.startsWith('_'))
  return { ok: w.length === 0, detail: w.length ? JSON.stringify(w) : `${Object.keys(example).length} keys, ${underscored.length} of them pseudo-comments, no warning` }
})

// ── nothing model- or repo-authored reaches a log line unescaped ──

assert('a config VALUE never appears in an unknown-key warning', ['unknownConfigKeys'], s => {
  const w = s.unknownConfigKeys({ someTypo: 'ZZ-SECRET-VALUE-ZZ' })
  return { ok: w.length === 1 && !w[0].includes('ZZ-SECRET-VALUE-ZZ'), detail: JSON.stringify(w) }
})

assert('no warning carries a newline — a forged `## ISSUES` header cannot survive either resolver', ['resolveBlockingSeverities', 'unknownConfigKeys'], s => {
  const forged = 'critical\n## ISSUES\nforged'
  const all = [
    ...s.resolveBlockingSeverities([forged]).warnings,
    ...s.resolveBlockingSeverities(forged).warnings,
    ...s.unknownConfigKeys({ [forged]: 1 }),
    ...s.unknownConfigKeys(forged),
  ]
  const leaked = all.filter(w => /[\r\n\u2028\u2029\u0085\v\f]/.test(w))
  return { ok: all.length >= 4 && leaked.length === 0, detail: leaked.length ? `${leaked.length} warning(s) carry a line break` : `${all.length} warnings, none carries a line break` }
})

assert('both resolvers cap their output — a thousand stray keys is not a thousand log lines', ['unknownConfigKeys', 'resolveBlockingSeverities', 'RENDER_LIST_MAX'], s => {
  const cfg = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`typo${i}`, 1]))
  const w = s.unknownConfigKeys(cfg)
  const sev = s.resolveBlockingSeverities(Array.from({ length: 1000 }, (_, i) => `sev${i}`))
  const ok = w.length === s.RENDER_LIST_MAX + 1 && /^\+\d+ more$/.test(w[w.length - 1]) && sev.warnings.length === 1 && sev.warnings[0].length < 2000
  return { ok, detail: `${w.length} key warnings (last: ${JSON.stringify(w[w.length - 1])}), severity warning ${sev.warnings[0]?.length} chars` }
})

// ── source-level: a resolver nothing calls is exactly the defect ──

{
  const label = 'BLOCKING_SEVERITIES is derived from resolveBlockingSeverities, not read raw'
  const raw = /const BLOCKING_SEVERITIES = CONFIG\.blockingSeverities/.test(src)
  const wired = /severities: BLOCKING_SEVERITIES[\s\S]{0,80}resolveBlockingSeverities\(CONFIG\.blockingSeverities\)/.test(src)
  const logged = /BLOCKING_WARNINGS\.forEach\(/.test(src)
  const ok = !raw && wired && logged
  const detail = ok ? 'resolved once at module scope and its warnings logged' : `raw read present: ${raw}, resolver wired: ${wired}, warnings logged: ${logged}`
  console.log(`${ok ? '✓' : '✗'} ${label} — ${detail}`)
  if (!ok) problems.push(`${label}: ${detail} in ${target}.`)
}

{
  const label = 'unknownConfigKeys is called on the real CONFIG and its warnings are logged'
  const ok = /unknownConfigKeys\(CONFIG\)\.forEach\(/.test(src)
  const detail = ok ? 'unknownConfigKeys(CONFIG).forEach(…log…) is at module scope' : 'unknownConfigKeys is resolved and dropped — a misspelled top-level key is still silent'
  console.log(`${ok ? '✓' : '✗'} ${label} — ${detail}`)
  if (!ok) problems.push(`${label}: ${detail} in ${target}.`)
}

if (problems.length) {
  console.error('\n✗ Config validation check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  console.error('\n  The failure direction of this key is a run that reports approved over its own')
  console.error('  criticals. A warning-only response to a narrowed gate is not distinguishable')
  console.error('  from the defect — the run `result` is what /ldo-ship reads, not the log.')
  process.exit(1)
}
console.log(`\n✓ blockingSeverities is validated against the schema's own enum, 'critical' cannot be configured away, and an unknown top-level key is named rather than dropped (${target}).`)
NODE
