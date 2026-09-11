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
NODE
