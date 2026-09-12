#!/usr/bin/env bash
# What a run costs is the one thing an operator asks about every pipeline, and
# until now nothing in workflows/ldo.js sampled it: `budget` appeared only in
# three "remaining" log lines. The measurement added for it has a failure mode
# that is invisible to `node --check` and to every other gate here, because the
# broken form is syntactically perfect and reads as good news — a cost block
# reporting 0. A harness that stops injecting `budget`, a `spent()` that returns
# a string, a reading that goes backwards: each of those, handled with a `|| 0`
# or a bare `catch {}`, produces `total_output_tokens_delta: 0` and a run log
# saying the work was free. That is the same defect class this repo has already
# closed three times — record_status, env_status, full_suite_status — each time
# by making an unmeasurable state an ENUM with a reason rather than a zero.
#
# So this drives the real readSpent, createCostLedger, renderCostLine and
# renderCost, brace-extracted out of workflows/ldo.js — nothing below is a copy
# of the source it checks. Each extraction is evaluated through
# `new Function('budget', ...)` so every scenario supplies its own fake harness
# global, which is exactly why readSpent must test `typeof budget === 'undefined'`
# rather than referencing it bare: a bare reference could not be driven from here
# at all, and a future harness that stops injecting the global would end a run
# with a ReferenceError over a figure nothing gates on.
#
# Two properties are asserted as CONTROLs rather than left implied:
#
#   * a healthy ledger reports 'measured' and never 'unavailable'. A ledger stuck
#     on unavailable would satisfy every one of the failure assertions trivially
#     while measuring nothing at all, which is not a fix.
#   * the per-entry list is ordered and appended, never keyed by label.
#     agentWithRetry and agentWithModelFallback both re-enter runAgent under the
#     same label, and both attempts cost real output tokens; a label-keyed store
#     would report one retry's cost as the whole phase and still look correct.
#
# The wiring assertions at the end cover what behaviour structurally cannot see:
# a perfect ledger that no call site opens measures nothing, and a `cost` key
# that drifted inside `stats` is a different result contract from the documented
# one while every behavioural assertion above stays green.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-change failure can be demonstrated without editing this script.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. They all validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-cost-accounting.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')

// Same technique as check-env-status.sh and check-verdict-gates.sh: find the
// declaration, then walk forward counting brackets until the first newline at
// depth zero. Covers both `const f = ...` arrows and `function f(...)` declarations.
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

// collapseLines and capList come out of the target too, not mirrored here: they
// are what caps the per-entry list and single-lines each label before it reaches
// a log line and an agent's prompt, and a copy in this harness would leave these
// assertions green while the shipped renderers stopped capping.
const WANTED = [
  'LINE_BREAK_RUN', 'PROMPT_TEXT_MAX', 'collapseLines', 'RENDER_LIST_MAX', 'capList',
  'COST_ENTRIES_MAX', 'COST_NOTE', 'formatTokens', 'costFigure',
  'readSpent', 'budgetRemaining', 'createCostLedger', 'renderCostLine', 'renderCost',
]
const problems = []
const sources = {}
for (const name of WANTED) {
  const body = extract(name)
  if (body) sources[name] = body
  else problems.push(`${name}: not found in ${target}. Either this source predates cost accounting (expected when pointing at a pre-change copy) or this script's extraction is stale — fix it before trusting a pass.`)
}

const found = WANTED.filter(n => sources[n])
const body = found.map(n => sources[n]).join('\n')

// Every scenario gets its own scope built over its own fake `budget`, so the
// absent-global case is a real absent global rather than a mocked one.
const makeScope = budget => {
  try {
    return new Function('budget', `${body}\nreturn { ${found.join(', ')} }`)(budget)
  } catch (e) {
    problems.push(`extracted declarations do not evaluate standalone (${e.message}) — this script's extraction is stale. Fix it before trusting a pass.`)
    return {}
  }
}
const probe = makeScope({ spent: () => 0 })

const assert = (label, deps, fn) => {
  const missing = deps.filter(d => !(d in probe))
  if (missing.length) {
    console.log(`✗ ${label} — could not run: ${missing.join(', ')} not extracted`)
    problems.push(`${label}: could not run, ${missing.join(', ')} not extracted`)
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

// A fake harness whose spent() walks a fixed sequence. Every readSpent call
// consumes one reading, which is what makes the arithmetic below checkable
// against hand-computed deltas rather than against the implementation.
const stepped = values => {
  let i = 0
  return { total: 500000, spent: () => values[Math.min(i++, values.length - 1)] }
}

// Whether an unmeasurable reading is reported as unmeasurable, or as free.
// `!== 0` is asserted separately from `=== null` on purpose: `0 === null` is
// already false, but the two say different things to a reader and the zero is
// the regression that actually ships.
const unavailableShape = (out, wantStatus = 'unavailable') => ({
  ok: out.status === wantStatus
    && out.total_output_tokens_delta === null
    && out.total_output_tokens_delta !== 0
    && typeof out.reason === 'string' && out.reason.trim() !== '',
  detail: `status = ${out.status}, total = ${JSON.stringify(out.total_output_tokens_delta)}, reason = ${JSON.stringify(out.reason)}`,
})

// ── measurement ──

assert('a clean two-phase run records two entries and a total of final minus baseline', ['createCostLedger'], () => {
  const s = makeScope(stepped([100, 100, 250, 250, 400, 400]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  led.open('Code', 'coder')()
  const out = led.finish()
  const ok = out.status === 'measured' && out.total_output_tokens_delta === 300
    && out.entries.length === 2 && out.entries.every(e => e.output_tokens_delta === 150)
    && out.unit === 'output_tokens'
  return { ok, detail: `total = ${out.total_output_tokens_delta}, entries = ${out.entries.map(e => e.output_tokens_delta).join('/')}` }
})

// A second run in the same turn starts from whatever the first one already
// burned. An implementation that reported the absolute reading would show the
// second run costing everything the first one did.
assert('a nonzero baseline yields deltas relative to it, never the absolute reading', ['createCostLedger'], () => {
  const s = makeScope(stepped([1000000, 1000000, 1000150, 1000150, 1000300, 1000300]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  led.open('Code', 'coder')()
  const out = led.finish()
  const ok = out.total_output_tokens_delta === 300 && out.entries.every(e => e.output_tokens_delta === 150)
  return { ok, detail: `total = ${out.total_output_tokens_delta} (absolute reading was 1000300)` }
})

assert('CONTROL: entries stay an ordered array — two Code and two Review passes are four entries, never two per-phase totals', ['createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 10, 10, 30, 30, 60, 60, 100, 100]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Code', 'coder')()
  led.open('Review', 'reviewer-1')()
  led.open('Code', 'coder-fix-1')()
  led.open('Review', 'reviewer-2')()
  const out = led.finish()
  const labels = out.entries.map(e => e.label).join(',')
  const deltas = out.entries.map(e => e.output_tokens_delta).join(',')
  const ok = out.entries.length === 4 && labels === 'coder,reviewer-1,coder-fix-1,reviewer-2' && deltas === '10,20,30,40'
  return { ok, detail: `labels = ${labels}, deltas = ${deltas}` }
})

// ── unavailable, one named assertion per shape ──

assert('UNAVAILABLE: no `budget` global at all — reported, never thrown, never 0', ['readSpent', 'createCostLedger'], () => {
  const s = makeScope(undefined)
  const read = s.readSpent()
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const out = led.finish()
  const shape = unavailableShape(out)
  return { ok: shape.ok && read.ok === false && typeof read.reason === 'string' && read.reason.trim() !== '', detail: shape.detail }
})

assert('UNAVAILABLE: budget.spent is not a function', ['createCostLedger'], () => {
  const s = makeScope({ total: 1, spent: 'nope' })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  return unavailableShape(led.finish())
})

assert('UNAVAILABLE: spent() returns NaN', ['createCostLedger'], () => {
  const s = makeScope({ spent: () => NaN })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  return unavailableShape(led.finish())
})

assert('UNAVAILABLE: spent() returns a string', ['createCostLedger'], () => {
  const s = makeScope({ spent: () => '12345' })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  return unavailableShape(led.finish())
})

assert('UNAVAILABLE: spent() returns a negative number', ['createCostLedger'], () => {
  const s = makeScope({ spent: () => -1 })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  return unavailableShape(led.finish())
})

assert('UNAVAILABLE: spent() throws — the message becomes the reason, not a swallowed 0', ['createCostLedger'], () => {
  const s = makeScope({ spent: () => { throw new Error('harness counter detached') } })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const out = led.finish()
  const shape = unavailableShape(out)
  return { ok: shape.ok && out.reason.includes('harness counter detached'), detail: shape.detail }
})

// ── partial: the baseline held, a later sample did not ──

assert('PARTIAL: one failed sample nulls that entry with a reason and leaves the others measured', ['createCostLedger'], () => {
  let n = 0
  const s = makeScope({ spent: () => { n++; if (n === 3) throw new Error('transient read failure'); return n * 100 } })
  const led = s.createCostLedger({ concurrent: false })
  led.open('Code', 'coder')()
  led.open('Review', 'reviewer-1')()
  const out = led.finish()
  const [a, b] = out.entries
  const ok = out.status === 'partial'
    && a.output_tokens_delta === null && a.output_tokens_delta !== 0
    && typeof a.unavailable_reason === 'string' && a.unavailable_reason.includes('transient read failure')
    && b.output_tokens_delta === 100
    && out.total_output_tokens_delta === 500
    && typeof out.reason === 'string' && /1 of 2/.test(out.reason)
  return { ok, detail: `status = ${out.status}, entries = ${JSON.stringify(out.entries.map(e => e.output_tokens_delta))}, reason = ${JSON.stringify(out.reason)}` }
})

assert('a reading that goes backwards is null with a reason — not a negative, not 0', ['createCostLedger'], () => {
  const s = makeScope(stepped([100, 500, 200, 600]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Code', 'coder')()
  const out = led.finish()
  const e = out.entries[0]
  const ok = e.output_tokens_delta === null && e.output_tokens_delta !== 0
    && /went backwards/.test(e.unavailable_reason || '')
    && out.status === 'partial'
  return { ok, detail: `delta = ${JSON.stringify(e.output_tokens_delta)}, reason = ${JSON.stringify(e.unavailable_reason)}` }
})

// The whole feature is reported and never gated on, so a broken counter must
// cost the run its accounting and nothing else.
assert('NEVER BREAKS A RUN: a throwing spent() propagates nothing out of open, close or finish', ['createCostLedger'], () => {
  const s = makeScope({ spent: () => { throw new Error('boom') } })
  const led = s.createCostLedger({ concurrent: true })
  const close = led.open('Code', 'coder')
  close()
  close()
  const out = led.finish()
  led.open('Review', 'reviewer-1')()
  led.finish()
  return { ok: out.status === 'unavailable', detail: 'open, a doubled close and two finish calls all returned normally' }
})

// Without this, every assertion above is satisfied by a ledger that reports
// 'unavailable' unconditionally and measures nothing.
assert("CONTROL: a healthy ledger reports 'measured' and carries no reason", ['createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 500, 500]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const out = led.finish()
  const ok = out.status === 'measured' && out.reason === undefined && out.total_output_tokens_delta === 500 && out.unattributed_output_tokens_delta === 0
  return { ok, detail: `status = ${out.status}, reason = ${JSON.stringify(out.reason)}, unattributed = ${out.unattributed_output_tokens_delta}` }
})

// Under parallel features the pool is shared, so a sibling's output lands inside
// this feature's brackets. Clamping the remainder at zero would hide exactly the
// overlap the `concurrent` flag exists to disclose.
assert('CONTROL: an unattributed remainder may go negative under concurrent features and is not clamped', ['createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 900, 900, 1000, 100]))
  const led = s.createCostLedger({ concurrent: true })
  led.open('Code', 'coder')()
  led.open('Review', 'reviewer-1')()
  const out = led.finish()
  const ok = out.concurrent === true && out.unattributed_output_tokens_delta < 0
  return { ok, detail: `unattributed = ${out.unattributed_output_tokens_delta}, concurrent = ${out.concurrent}` }
})

// ── the renderers ──

assert('renderCostLine on a measured block names the unit, the baseline and each agent', ['renderCostLine', 'createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 84200, 84200, 315200, 315200]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  led.open('Code', 'coder')()
  const line = s.renderCostLine(led.finish())
  const ok = line.startsWith('Cost (output tokens, delta from run start):') && /planner 84\.2k/.test(line) && /coder 231\.0k/.test(line) && !line.includes('\n')
  return { ok, detail: JSON.stringify(line) }
})

assert('renderCostLine on an unavailable block says so, says it is not zero, and prints no 0 figure', ['renderCostLine', 'createCostLedger'], () => {
  const s = makeScope(undefined)
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const line = s.renderCostLine(led.finish())
  const ok = line.includes('Cost accounting unavailable')
    && /still spent output tokens/.test(line)
    && !/(^|[^\d])0([^\d]|$)/.test(line)
  return { ok, detail: JSON.stringify(line) }
})

assert('renderCostLine discloses the overlap when features ran concurrently', ['renderCostLine', 'createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 100, 100]))
  const led = s.createCostLedger({ concurrent: true })
  led.open('Plan', 'planner')()
  const line = s.renderCostLine(led.finish())
  return { ok: /do not partition the pool/.test(line), detail: JSON.stringify(line) }
})

assert('renderCost emits a ## COST heading, a Total line and one integer line per entry', ['renderCost', 'createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 84213, 84213, 315217, 315217]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  led.open('Code', 'coder')()
  const block = s.renderCost(led.finish())
  const ok = block.includes('## COST')
    && /\n- Total: 315217\b/.test(block)
    && /\n- planner \(Plan\): 84213\b/.test(block)
    && /\n- coder \(Code\): 231004\b/.test(block)
    && /## Cost/.test(block)
  return { ok, detail: JSON.stringify(block.slice(0, 160)) }
})

// The block travels to the Recorder and into a review report an operator reads
// to decide what a run cost. Without this sentence the report reads as a
// complete cost accounting, which it structurally is not.
assert('renderCost carries the honesty sentence — output only, no input tokens, no cache', ['renderCost', 'createCostLedger'], () => {
  const s = makeScope(stepped([0, 0, 100, 100]))
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const block = s.renderCost(led.finish())
  const ok = block.includes('no input tokens') && block.includes('cache') && /caching/.test(block) && /not an attribution/.test(block)
  return { ok, detail: 'honesty sentence present' }
})

assert("renderCost on an unavailable block reads 'not measured' everywhere and forbids a zero", ['renderCost', 'createCostLedger'], () => {
  const s = makeScope(undefined)
  const led = s.createCostLedger({ concurrent: false })
  led.open('Plan', 'planner')()
  const block = s.renderCost(led.finish())
  const totalLine = block.split('\n').find(l => l.startsWith('- Total:')) || ''
  const entryLine = block.split('\n').find(l => l.startsWith('- planner (Plan):')) || ''
  const ok = totalLine === '- Total: not measured'
    && entryLine === '- planner (Plan): not measured'
    && /never a zero/.test(block)
  return { ok, detail: `${JSON.stringify(totalLine)} / ${JSON.stringify(entryLine)}` }
})

assert('renderCost returns the empty string when there is no cost block, so no prompt bytes are paid', ['renderCost'], () => {
  const s = makeScope(undefined)
  return { ok: s.renderCost(null) === '' && s.renderCost(undefined) === '', detail: 'empty for both' }
})

// A property read runs a getter, so a shape check placed OUTSIDE the try has
// its own way to throw — past every catch, ending a run over a figure nothing
// branches on. Contrived against today's harness, which hands over a plain
// object; kept because it is the one route by which this function can still
// raise, and the whole design says it must not.
assert('readSpent survives a budget whose spent is a throwing getter', ['readSpent'], () => {
  const bomb = {}
  Object.defineProperty(bomb, 'spent', { get() { throw new Error('getter bomb') } })
  const s = makeScope(bomb)
  let r
  try { r = s.readSpent() } catch (e) { return { ok: false, detail: `threw ${e.message} instead of reporting a reason` } }
  return { ok: r.ok === false && typeof r.reason === 'string' && r.reason.length > 0, detail: JSON.stringify(r) }
})

assert('createCostLedger survives the same throwing getter', ['createCostLedger'], () => {
  const bomb = {}
  Object.defineProperty(bomb, 'spent', { get() { throw new Error('getter bomb') } })
  const s = makeScope(bomb)
  let led
  try { led = s.createCostLedger() } catch (e) { return { ok: false, detail: `threw ${e.message}` } }
  const fin = led.finish ? led.finish() : led
  return { ok: !!fin && fin.status === 'unavailable' && fin.total_output_tokens_delta === null, detail: JSON.stringify(fin).slice(0, 160) }
})

// The three `Budget remaining:` log lines used to read `budget.total` bare, and
// one of them runs BEFORE the ledger exists — so a harness that stopped
// injecting the global would die there with a ReferenceError and the
// unavailable path every assertion above drives would be unreachable in a real
// run. A degradation that cannot be reached is not a degradation.
for (const [why, budget] of [
  ['no budget global at all', undefined],
  ['a budget with no total', { spent: () => 0 }],
  ['a throwing remaining()', { total: 100, spent: () => 0, remaining() { throw new Error('boom') } }],
  ['a non-numeric remaining()', { total: 100, spent: () => 0, remaining: () => 'lots' }],
]) {
  assert(`budgetRemaining returns null instead of throwing — ${why}`, ['budgetRemaining'], () => {
    const s = makeScope(budget)
    let r
    try { r = s.budgetRemaining() } catch (e) { return { ok: false, detail: `threw ${e.message}` } }
    return { ok: r === null, detail: `returned ${JSON.stringify(r)}, expected null` }
  })
}

assert('CONTROL: budgetRemaining formats a real target rather than swallowing it', ['budgetRemaining'], () => {
  const s = makeScope({ total: 500000, spent: () => 0, remaining: () => 250000 })
  const r = s.budgetRemaining()
  return { ok: r === '250k', detail: `returned ${JSON.stringify(r)}` }
})

// The unavailable block must not promise a total "elsewhere" two lines after
// saying nothing could be measured.
assert('renderCost on an unavailable block promises no total elsewhere', ['renderCost', 'createCostLedger'], () => {
  const s = makeScope(undefined)
  const led = s.createCostLedger()
  const out = s.renderCost(led.finish ? led.finish() : led)
  const promises = /carry a later(,| ) *(larger )?total that does/.test(out)
  return { ok: !promises, detail: promises ? 'still promises a later total' : 'no promise of a total elsewhere' }
})

// ── the wiring, asserted against the source ──
//
// Every function above can be perfect while nothing calls it, or while the
// result carries the block somewhere no documented consumer looks. Neither is
// visible to a behavioural assertion, because both live at call sites.
{
  const label = 'runAgent brackets the agent() call with the ledger and closes it in a `finally`'
  const fn = extract('runAgent') || ''
  const openAt = fn.indexOf('ledger.open(')
  const agentAt = fn.indexOf('await agent(')
  const finallyAt = fn.indexOf('} finally {')
  const ok = openAt > 0 && agentAt > openAt && finallyAt > agentAt && /closeCost\(\)/.test(fn.slice(finallyAt))
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: in ${target}, runAgent does not open the ledger before agent() and close it in a finally — an agent that stalls or throws would record nothing, which is the run the figure is most wanted for.`)
}

{
  const label = 'all nine agent call sites pass the feature ledger'
  const count = (src.match(/ledger: ctx\.ledger/g) || []).length
  const ok = count === 9
  console.log(`${ok ? '✓' : '✗'} ${label} — ${count} site(s)`)
  if (!ok) problems.push(`${label}: found ${count} \`ledger: ctx.ledger\` site(s) in ${target}, expected 9 (including focused surface research and the resolution Planner pass). A missing one is an agent whose output is silently unattributed.`)
}

{
  const label = 'the ledger is created before the first phase, on the per-feature ctx'
  const ok = /ctx\.ledger = createCostLedger\(\{ concurrent: \(ctx\.total \|\| 1\) > 1 \}\)/.test(src)
    && src.indexOf('ctx.ledger = createCostLedger') < src.indexOf('await phaseIsolate(')
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: in ${target}, runOneFeature does not create the ledger on ctx before phaseIsolate, so the baseline is sampled after work has already run.`)
}

// `cost` inside `stats` would be a different result contract from the one the
// README documents, and every behavioural assertion above would still pass.
for (const [name, endMarker] of [['shapeResult', 'function shapePlanOnly('], ['shapePlanOnly', '// MAIN']]) {
  const label = `${name} carries \`cost\` top-level, at the same indent as the other qualifier fields, outside \`stats\``
  const start = src.indexOf(`function ${name}(`)
  const end = src.indexOf(endMarker, start)
  const region = start >= 0 && end > start ? src.slice(start, end) : ''
  const costAt = region.indexOf('\n    cost: ')
  const statsAt = region.indexOf('\n    stats: {')
  const ok = costAt > 0 && statsAt > 0 && costAt < statsAt && /\n {6}cost:/.test(region) === false
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: in ${target}, ${name} does not carry a four-space-indented \`cost:\` key ahead of its \`stats:\` object.`)
}

{
  const label = 'the COST block is composed into the Record prompt, not resolved and dropped'
  const ok = /designDriftBlock \+ renderCost\(cost\)/.test(src) && /const cost = ctx\.ledger \? ctx\.ledger\.finish\(\) : null/.test(src)
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: in ${target}, phaseRecord does not sample the ledger and append renderCost(cost) to recordPrompt — a renderer nothing calls is exactly the defect.`)
}

{
  const label = 'the run log prints exactly one cost line per feature, on every path a run can end on'
  const count = (src.match(/renderCostLine\(/g) || []).length
  const ok = count === 4
  console.log(`${ok ? '✓' : '✗'} ${label} — ${count} reference(s), 1 declaration + 3 call sites`)
  if (!ok) problems.push(`${label}: found ${count} renderCostLine reference(s) in ${target}, expected 4 (the declaration, the plan-only path, the full path and the resolution-required path).`)
}

{
  // A run the resolution gate stops still paid for a Planner pass, often a
  // Researcher and a second Planner on top. It used to return before the ledger
  // was ever closed, so the most expensive thing about a blocked run — that it
  // is not free — was the one thing its result did not say.
  const label = 'a run stopped by the resolution gate reports its cost like any other'
  const ok = /const blockedCost = ctx\.ledger\.finish\(\)/.test(src) && /renderCostLine\(blockedCost\)/.test(src) && /return \{ \.\.\.planResult, cost: blockedCost \}/.test(src)
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: ${target} returns the resolution-required result without closing the ledger, so a blocked run reports no cost at all.`)
}

{
  const label = 'the honesty sentence naming input tokens and caching lives in the source, not only in the README'
  const ok = /no input tokens/.test(src) && /no cache reads/.test(src) && /prompt caching is helping/.test(src)
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) problems.push(`${label}: ${target} does not carry the output-tokens-only disclosure, so the figure reaches a report with nothing saying what it excludes.`)
}

if (problems.length) {
  console.error('\n✗ Cost accounting check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ Per-phase output-token accounting is measured, and an unmeasurable reading is reported as such rather than as zero (${target}).`)
NODE
