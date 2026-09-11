#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node --input-type=module <<'NODE'
import { createPipeline } from './core/pipeline.mjs'

const calls = []
const adapter = {
  async run(options) {
    calls.push(options)
    if (options.role === 'planner') return { value: { summary: 'plan' }, raw: '{}' }
    if (options.role === 'coder') return { value: { summary: 'code' }, raw: '{}' }
    return { value: { status: calls.filter(c => c.role === 'reviewer').length === 1 ? 'changes_requested' : 'approved' }, raw: '{}' }
  },
}
const pipeline = createPipeline({
  adapter,
  schemas: { planner: 'plan', coder: 'code', reviewer: 'review' },
  prompt: ({ role }) => role,
  retries: 0,
})
const result = await pipeline({ task: 'test', cwd: process.cwd() })
const roles = calls.map(c => c.role).join(',')
const writable = calls.filter(c => c.role === 'coder').every(c => c.writable === true)
if (!result.approved || roles !== 'planner,coder,reviewer,coder,reviewer' || !writable) {
  throw new Error(`unexpected pipeline: approved=${result.approved} roles=${roles} writable=${writable}`)
}
console.log('✓ shared pipeline performs plan → code → review → fix → review')

const planOnlyCalls = []
const planOnly = createPipeline({
  adapter: { async run(options) { planOnlyCalls.push(options.role); return { value: { summary: 'plan' }, raw: '{}' } } },
  schemas: { planner: 'plan', coder: 'code', reviewer: 'review' },
  prompt: ({ role }) => role,
  retries: 0,
})
const planned = await planOnly({ task: 'test', cwd: process.cwd(), planOnly: true })
if (planned.mode !== 'plan-only' || planOnlyCalls.join(',') !== 'planner') {
  throw new Error(`unexpected plan-only pipeline: mode=${planned.mode} roles=${planOnlyCalls.join(',')}`)
}
console.log('✓ plan-only stops after the planner')

const securityCalls = []
const securityPipeline = createPipeline({
  adapter: {
    async run(options) {
      securityCalls.push(options)
      if (options.role === 'planner') return { value: { summary: 'plan', security_surface: 'elevated' }, raw: '{}' }
      return { value: { status: 'clean', summary: 'threat model', findings: [], threat_model_notes: null }, raw: '{}' }
    },
  },
  schemas: { planner: 'plan', security: 'security', coder: 'code', reviewer: 'review' },
  prompt: ({ role }) => role,
  retries: 0,
})
const securedPlan = await securityPipeline({ task: 'test', cwd: process.cwd(), planOnly: true })
if (securityCalls.map(c => c.role).join(',') !== 'planner,security' || securedPlan.security?.value.status !== 'clean') {
  throw new Error(`security phase did not follow elevated plan: ${securityCalls.map(c => c.role).join(',')}`)
}
console.log('✓ elevated plans run Security before plan-only returns')

const researchCalls = []
const researchPipeline = createPipeline({
  adapter: {
    async run(options) {
      researchCalls.push(options)
      if (options.role === 'researcher') return { value: { summary: 'research' }, raw: '{}' }
      return { value: { summary: 'plan', security_surface: 'none' }, raw: '{}' }
    },
  },
  schemas: { researcher: 'research', planner: 'plan', coder: 'code', reviewer: 'review' },
  prompt: ({ role }) => role,
  retries: 0,
})
const researchedPlan = await researchPipeline({ task: 'test', cwd: process.cwd(), research: true, planOnly: true })
if (researchCalls.map(c => c.role).join(',') !== 'researcher,planner' || researchCalls[0].search !== true || researchedPlan.research?.value.summary !== 'research') {
  throw new Error(`research phase was not carried into planning: ${researchCalls.map(c => c.role).join(',')}`)
}
console.log('✓ opt-in research runs before planning and is carried forward')

const recordCalls = []
const recordPipeline = createPipeline({
  adapter: {
    async run(options) {
      recordCalls.push(options)
      const values = {
        planner: { complexity: 'medium', summary: 'plan', security_surface: 'none' },
        coder: { summary: 'code' },
        reviewer: { status: 'approved', summary: 'review' },
        recorder: { worktree_root: process.cwd(), files_written: ['docs/reviews/test.md'], backlog: { destination: 'none', file: null, count: 0 }, notes: '' },
      }
      return { value: values[options.role], raw: '{}' }
    },
  },
  schemas: { planner: 'plan', coder: 'code', reviewer: 'review', recorder: 'record' },
  prompt: ({ role }) => role,
  retries: 0,
})
const recorded = await recordPipeline({ task: 'test', cwd: process.cwd() })
if (recordCalls.map(c => c.role).join(',') !== 'planner,coder,reviewer,recorder' || recordCalls.at(-1).writable !== true || recorded.record?.value.files_written.length !== 1) {
  throw new Error(`record phase did not persist after an approved medium plan: ${recordCalls.map(c => c.role).join(',')}`)
}
console.log('✓ medium approved runs persist a recorder report')
NODE

LDO_ISOLATION_WORK="$(mktemp -d)"
trap 'rm -rf "$LDO_ISOLATION_WORK"' EXIT
git -C "$LDO_ISOLATION_WORK" init -q
git -C "$LDO_ISOLATION_WORK" config user.email ldo-test@example.invalid
git -C "$LDO_ISOLATION_WORK" config user.name 'LDO core test'
git -C "$LDO_ISOLATION_WORK" commit --allow-empty -qm 'initial'

LDO_ISOLATION_WORK="$LDO_ISOLATION_WORK" node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createIsolatedWorktree } from './core/isolation.mjs'

const root = process.env.LDO_ISOLATION_WORK
const isolated = await createIsolatedWorktree({ cwd: root, task: 'A safe isolated test' })
const ignored = await readFile(join(root, '.gitignore'), 'utf8')
if (!isolated.path.startsWith(`${root}/.worktrees/`) || isolated.branch !== 'ldo/a-safe-isolated-test' || !ignored.includes('.worktrees/')) {
  throw new Error(`unexpected isolation result: ${JSON.stringify(isolated)}`)
}
console.log('✓ deterministic isolation creates and verifies a fresh worktree')
NODE
