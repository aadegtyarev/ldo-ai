#!/usr/bin/env bash
# `isolate: true` and args.tasks promise the operator's own working tree is not
# written to. Before the Isolate phase, the only thing behind that promise was
# prose asking the Planner to run `git worktree add` as a side task, plus a gate
# that checked two model-authored strings were non-empty. Issue #12's control
# pair measured what that is worth: two runs, one session, same flag — the run
# whose task prose happened to carry the worktree command got a worktree, the
# one without it edited the operator's tree, 27 files and 1678 insertions, with
# nothing logged. A skipped step and a completed one looked identical.
#
# node --check cannot see any of that: a pipeline that never creates a worktree
# is syntactically perfect, and so is a proof-checker that is never called. So
# this drives the REAL verifyWorktreeProof and parseWorktreeList, brace-extracted
# out of the target, against scripts/fixtures/worktree-proof.json — genuine
# output from a real `git worktree add`, with only the repository root rewritten
# to a synthetic `/srv/repo` so no operator's machine layout is committed. Every
# check in verifyWorktreeProof is prefix/suffix-relational, so an internally
# consistent synthetic root exercises each assertion identically.
#
# Two assertion families, for two different ways this can rot:
#   - Behavioural: the CONTROL (a genuine proof must still pass — a checker that
#     rejects everything aborts every isolated run and is not a fix), then one
#     SEPARATELY NAMED failing assertion per defect shape, each checked for its
#     own reason string, so a failure says which check leaked rather than
#     "one of nineteen".
#   - Source-level: verifyWorktreeProof must be referenced inside phaseIsolate,
#     and runOneFeature must call phaseIsolate before phasePlan. A mechanism
#     that exists but is never invoked is precisely the defect being fixed here,
#     and it is invisible to every behavioural assertion above.
#
# The second argument points the same assertions at a different copy of
# workflows/ldo.js — `git show HEAD:workflows/ldo.js > /tmp/pre.js` — so the
# pre-change failure can be demonstrated without editing this script.
#
# WHERE THIS LIVES: scripts/, beside the other gates, and scripts/vendor.sh
# deliberately does not copy it. All of them validate LDO's own source, which a
# consumer of the vendored plugin never edits. Moving it is not a fix.
#
# Usage: scripts/check-isolation.sh [repo-root] [path-to-ldo.js]

set -euo pipefail
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
TARGET="${2:-workflows/ldo.js}"

TARGET="$TARGET" node --input-type=module <<'NODE'
import { readFileSync } from 'fs'

const target = process.env.TARGET
const src = readFileSync(target, 'utf8')

// Same technique as check-scoped-tests.sh: find the declaration, then walk
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

// safeWorktreePath delegates to safeMigrationsDir, and both regexes are module
// constants: extracting them rather than mirroring them here is what makes a
// widening of the character class fail this gate instead of leaving it green
// against the harness's own private copy.
const WANTED_CONSTS = ['SAFE_REL_PATH', 'ISOLATION_FIELD_MAX', 'ISOLATION_LIST_MAX', 'ISOLATION_ENTRY_MAX', 'ISOLATION_REQUIRED', 'ISOLATION_PREFIX', 'ISOLATION_GIT_DIR', 'SAFE_ISOLATION_BRANCH', 'SAFE_ISOLATION_SHA']
const WANTED_FNS = ['safeMigrationsDir', 'safeWorktreePath', 'parseWorktreeList', 'verifyWorktreeProof']
const WANTED = [...WANTED_CONSTS, ...WANTED_FNS]
const problems = []
const sources = {}
for (const name of WANTED) {
  const body = extract(name)
  if (body) sources[name] = body
  else problems.push(`${name}: not found in ${target}. Either this source predates the Isolate phase (expected when pointing at a pre-change copy) or this script's extraction is stale — fix it before trusting a pass.`)
}

// Constants first so no extracted function body sits in their temporal dead zone.
const found = [...WANTED_CONSTS, ...WANTED_FNS].filter(n => sources[n])
let scope = {}
try {
  const body = found.map(n => sources[n]).join('\n')
  scope = new Function(`${body}\nreturn { ${found.join(', ')} }`)()
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

const FIXTURE = JSON.parse(readFileSync('scripts/fixtures/worktree-proof.json', 'utf8'))
const proof = (overrides = {}) => ({ ...FIXTURE, ...overrides })

// ── CONTROL: a genuine proof must pass ──
//
// First, because a verifier that rejects everything makes every isolated run
// abort — a louder failure than the silent one, but still a failure, and it
// would leave every reject assertion below green.

assert('CONTROL: real captured `git worktree add` output verifies', ['verifyWorktreeProof'], s => {
  const r = s.verifyWorktreeProof(proof())
  return {
    ok: r.ok === true && r.path === FIXTURE.worktree_path && r.branch === FIXTURE.branch && r.root === FIXTURE.toplevel,
    detail: JSON.stringify(r),
  }
})

assert('CONTROL: the fixture is real porcelain — two entries, main plus the worktree', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList(FIXTURE.worktree_list)
  return { ok: e.length === 2 && e[1].path === FIXTURE.toplevel && e[1].branch === `refs/heads/${FIXTURE.branch}`, detail: JSON.stringify(e) }
})

// ── the reject direction, one named assertion per defect shape ──

const rejects = (label, overrides, expectReason) => {
  assert(label, ['verifyWorktreeProof'], s => {
    const r = s.verifyWorktreeProof(proof(overrides))
    const reasonOk = expectReason ? String(r.reason || '').includes(expectReason) : true
    return { ok: r.ok === false && reasonOk, detail: `returned ${JSON.stringify(r)}` }
  })
}

// THE observed failure of issue #12: the agent never created anything and ran
// all four commands where it already stood, so every output describes the main
// checkout. `<root>/.git` versus `<root>/.git/worktrees/<name>` is the one
// structural discriminator that omission cannot fake.
rejects(
  'rejects a main-checkout git_dir — the exact shape of an agent that never ran `git worktree add`',
  { git_dir: `${FIXTURE.main_root}/.git`, toplevel: FIXTURE.main_root },
  'toplevel is the main checkout',
)
rejects(
  'rejects a main-checkout git_dir even when toplevel is dressed up as the worktree',
  { git_dir: `${FIXTURE.main_root}/.git` },
  'git_dir is not a linked worktree git dir',
)
rejects('rejects toplevel === main_root', { toplevel: FIXTURE.main_root }, 'toplevel is the main checkout')
rejects('rejects a relative toplevel', { toplevel: '.worktrees/demo' }, 'toplevel is not an absolute path')
rejects('rejects HEAD sitting on another branch inside the worktree', { head_branch: 'ldo/other' }, 'HEAD inside the worktree is not on the reported branch')
rejects('rejects a toplevel that does not end with the reported worktree_path', { toplevel: '/srv/repo/.worktrees/other' }, 'toplevel does not end with the reported worktree_path')

// git always lists the main checkout, so a real add produces at least two
// entries. One entry means the listing describes a repo with no worktree in it.
rejects(
  'rejects a porcelain listing holding only the main entry',
  { worktree_list: `worktree ${FIXTURE.main_root}\nHEAD ${FIXTURE.base_head}\nbranch refs/heads/main\n` },
  'fewer than two worktrees',
)
rejects(
  'rejects a listing with no entry for the reported toplevel',
  { worktree_list: `worktree ${FIXTURE.main_root}\nbranch refs/heads/main\n\nworktree /srv/repo/.worktrees/elsewhere\nbranch refs/heads/ldo/elsewhere\n` },
  'no entry for the reported toplevel',
)
rejects(
  'rejects a listing whose matching entry is on a different branch',
  { worktree_list: FIXTURE.worktree_list.replace(`refs/heads/${FIXTURE.branch}`, 'refs/heads/ldo/somebody-else') },
  'on a different branch',
)

// `-B`, a bare branch argument, and git's DWIM checkout of an existing
// remote-tracking ldo/<slug> all satisfy every check above with entirely honest
// outputs — this is the one that separates a fresh -b from an adopted branch.
rejects(
  'rejects an adopted branch — head_sha does not equal the base_head captured before the add',
  { head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  'the branch was adopted, not created with -b',
)
rejects('rejects a head_sha that is not a commit sha', { head_sha: 'not-a-sha' }, 'not a commit sha')
rejects('rejects a base_head that is not a commit sha', { base_head: 'HEAD' }, 'not a commit sha')

// The path is interpolated into the ISOLATION block that every later agent
// pastes into `cd` and `git` command lines, so it gets the same
// reject-by-segment treatment safeMigrationsDir gives migrations.directory.
rejects('rejects an absolute worktree_path', { worktree_path: '/etc', toplevel: '/etc' }, 'not a safe relative path')
rejects('rejects a `..` segment in worktree_path', { worktree_path: '.worktrees/../../etc', toplevel: '/srv/repo/.worktrees/../../etc' }, 'not a safe relative path')
rejects('rejects a worktree_path outside .worktrees/', { worktree_path: 'src', toplevel: '/srv/repo/src' }, 'not a safe relative path')
rejects('rejects a segment starting with a dash — a character class alone calls `-rf` well-formed', { worktree_path: '.worktrees/-rf', toplevel: '/srv/repo/.worktrees/-rf' }, 'not a safe relative path')
rejects('rejects a nested dot segment — only the fixed .worktrees prefix may start with one', { worktree_path: '.worktrees/.git', toplevel: '/srv/repo/.worktrees/.git' }, 'not a safe relative path')
rejects('rejects a shell metacharacter in worktree_path', { worktree_path: '.worktrees/a;rm -rf /', toplevel: '/srv/repo/.worktrees/a;rm -rf /' }, 'not a safe relative path')
rejects('rejects a branch outside ldo/', { branch: 'main', head_branch: 'main' }, 'not of the form ldo/')
rejects('rejects a branch whose name segment starts with a dash', { branch: 'ldo/-f', head_branch: 'ldo/-f' }, 'not of the form ldo/')

// Bound before scanning: both values are prepended to every prompt for the rest
// of the run, and every comparable model-authored value in this codebase is
// already capped (SCOPED_TEMPLATE_MAX, collapseLines, capList).
rejects('rejects an over-long worktree_path before running any regex over it', { worktree_path: `.worktrees/${'a'.repeat(400)}` }, 'over the length limit')
rejects('rejects an over-long branch', { branch: `ldo/${'a'.repeat(400)}` }, 'over the length limit')

assert('rejects a worktree_list past the byte cap rather than scanning it', ['verifyWorktreeProof', 'ISOLATION_LIST_MAX'], s => {
  const r = s.verifyWorktreeProof(proof({ worktree_list: 'x'.repeat(s.ISOLATION_LIST_MAX + 1) }))
  return { ok: r.ok === false && String(r.reason).includes('over the byte limit'), detail: `returned ${JSON.stringify(r.reason)}` }
})

assert('parseWorktreeList caps the entries it returns', ['parseWorktreeList', 'ISOLATION_ENTRY_MAX'], s => {
  const many = Array.from({ length: s.ISOLATION_ENTRY_MAX + 50 }, (_, i) => `worktree /srv/repo/w${i}\nbranch refs/heads/b${i}`).join('\n\n')
  const e = s.parseWorktreeList(many)
  return { ok: e.length === s.ISOLATION_ENTRY_MAX, detail: `${e.length} entries, cap ${s.ISOLATION_ENTRY_MAX}` }
})

// Every required field, blanked in turn. A loop, but each iteration prints its
// own line — a single "some field is optional" failure has to name which one.
assert('ISOLATION_REQUIRED is the full field list the schema demands', ['ISOLATION_REQUIRED'], s => {
  return { ok: s.ISOLATION_REQUIRED.length === 9, detail: s.ISOLATION_REQUIRED.join(', ') }
})
;(scope.ISOLATION_REQUIRED || []).forEach(field => {
  rejects(`rejects a blank ${field}`, { [field]: '   ' }, 'missing or blank')
  rejects(`rejects a missing ${field}`, { [field]: undefined }, 'missing or blank')
})

assert('rejects a non-object or missing report without throwing — the isolator returning nothing is not an isolated run', ['verifyWorktreeProof'], s => {
  const rs = [s.verifyWorktreeProof(null), s.verifyWorktreeProof('ok'), s.verifyWorktreeProof([]), s.verifyWorktreeProof(undefined)]
  return { ok: rs.every(r => r.ok === false && r.reason), detail: JSON.stringify(rs.map(r => r.reason)) }
})

// ── parseWorktreeList: the porcelain shapes a naive parser gets wrong ──

assert('keeps a worktree path containing a space intact — never split on whitespace', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('worktree /srv/my repo/.worktrees/demo\nbranch refs/heads/ldo/demo\n')
  return { ok: e.length === 1 && e[0].path === '/srv/my repo/.worktrees/demo', detail: JSON.stringify(e) }
})

assert('reads a block whose `worktree` line is not first — line order is not a parser assumption', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('HEAD abc123\nbranch refs/heads/ldo/demo\nworktree /srv/repo/.worktrees/demo\n')
  return { ok: e.length === 1 && e[0].path === '/srv/repo/.worktrees/demo' && e[0].branch === 'refs/heads/ldo/demo', detail: JSON.stringify(e) }
})

assert('drops a bare repository block — it has no working tree to be the one proven', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('worktree /srv/repo.git\nbare\n\nworktree /srv/repo/.worktrees/demo\nbranch refs/heads/ldo/demo\n')
  return { ok: e.length === 1 && e[0].path === '/srv/repo/.worktrees/demo', detail: JSON.stringify(e) }
})

assert('mangles nothing from a block with no `worktree` line — it is skipped, not sliced blindly', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('HEAD abc123\ndetached\n\nworktree /srv/repo/.worktrees/demo\nbranch refs/heads/ldo/demo\n')
  return { ok: e.length === 1 && e[0].path === '/srv/repo/.worktrees/demo', detail: JSON.stringify(e) }
})

assert('carries a detached entry with no branch rather than dropping it', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('worktree /srv/repo/.worktrees/x\nHEAD abc123\ndetached\n')
  return { ok: e.length === 1 && e[0].branch === null, detail: JSON.stringify(e) }
})

assert('returns trimmed values — a validated trimmed copy and a raw return would disagree', ['parseWorktreeList'], s => {
  const e = s.parseWorktreeList('worktree /srv/repo/.worktrees/demo \r\nbranch refs/heads/ldo/demo \r\n')
  return { ok: e.length === 1 && e[0].path === '/srv/repo/.worktrees/demo' && e[0].branch === 'refs/heads/ldo/demo', detail: JSON.stringify(e) }
})

assert('a non-string list yields no entries rather than throwing', ['parseWorktreeList'], s => {
  const rs = [s.parseWorktreeList(null), s.parseWorktreeList(undefined), s.parseWorktreeList(42), s.parseWorktreeList({})]
  return { ok: rs.every(r => Array.isArray(r) && r.length === 0), detail: JSON.stringify(rs) }
})

// ── source-level: the mechanism must actually be wired in ──
//
// Every assertion above passes against a verifyWorktreeProof that nothing ever
// calls — which is a faithful description of the defect this replaced, where
// the ISOLATION block was rendered from a path no code had checked existed.

const extractBlock = opener => {
  const start = src.indexOf(opener)
  if (start < 0) return null
  let depth = 0
  for (let k = start; k < src.length; k++) {
    const c = src[k]
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, k + 1) }
  }
  return null
}

const sourceAssert = (label, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

{
  const body = extractBlock('async function phaseIsolate(')
  sourceAssert(
    'phaseIsolate calls verifyWorktreeProof on what the isolator returned',
    !!body && body.includes('verifyWorktreeProof('),
    body ? `${body.length} chars extracted` : `phaseIsolate not found in ${target}`,
  )
  sourceAssert(
    'a failed proof returns an explicit error object — never null, never a fall-through to the working tree',
    !!body && /return \{ error: `Isolation could not be verified/.test(body) && /approved: false/.test(body),
    body ? 'checked the failure return' : `phaseIsolate not found in ${target}`,
  )
}

{
  const body = extractBlock('async function runOneFeature(')
  const iso = body ? body.indexOf('phaseIsolate(') : -1
  const pln = body ? body.indexOf('phasePlan(') : -1
  sourceAssert(
    'runOneFeature calls phaseIsolate BEFORE phasePlan — a mechanism that is never invoked is this defect',
    iso >= 0 && pln >= 0 && iso < pln,
    body ? `phaseIsolate at ${iso}, phasePlan at ${pln}` : `runOneFeature not found in ${target}`,
  )
  sourceAssert(
    'a failed Isolate returns immediately, so no Planner, Coder or Reviewer runs',
    !!body && /if \(isolateResult\.error\) return isolateResult/.test(body),
    body ? 'checked the early return' : `runOneFeature not found in ${target}`,
  )
}

// work_location is what a consumer reads as "the operator's own tree was not
// written to". Derived from the input flag it restates what was asked for;
// derived from the verified object it cannot say 'worktree' unless
// verifyWorktreeProof returned ok.
{
  const i = src.indexOf('work_location:')
  const line = i >= 0 ? src.slice(i, src.indexOf('\n', i)) : ''
  sourceAssert(
    "work_location is derived from the verified isolation object, not from ctx.isMulti",
    i >= 0 && line.includes('isolation ?') && !line.includes('ctx.isMulti'),
    line ? line.trim() : `no work_location in ${target}`,
  )
}

// The isolator holds unrestricted Bash and one job, which is exactly the shape
// that reaches for `git worktree remove --force` when `add` fails — and a
// worktree obtained by destroying a sibling's produces a proof that passes
// every check above.
{
  const body = extractBlock('async function phaseIsolate(')
  const banned = ['git worktree remove', 'git worktree prune', 'git branch -D', 'rm -rf', 'git push']
  const missing = banned.filter(b => !body?.includes(b))
  sourceAssert(
    'the isolator prompt names the destructive commands it must never run',
    missing.length === 0,
    missing.length ? `not named: ${missing.join(', ')}` : `all ${banned.length} named`,
  )
}

if (problems.length) {
  console.error('\n✗ Isolation check failed:\n')
  problems.forEach(p => console.error(`  - ${p}`))
  process.exit(1)
}
console.log(`\n✓ A worktree is created and proven before any other agent runs, and an unproven one aborts the feature (${target}).`)
NODE
