#!/usr/bin/env node
import { resolve } from 'node:path'
import { createClaudeCliAdapter } from '../adapters/claude-cli.mjs'
import { createCodexCliAdapter } from '../adapters/codex-cli.mjs'
import { createPipeline } from '../core/pipeline.mjs'
import { buildPrompt } from '../core/prompts.mjs'

function usage() {
  console.error('Usage: node scripts/ldo-run.mjs --runtime codex|claude [--model MODEL] [--planner-model MODEL] [--coder-model MODEL] [--reviewer-model MODEL] [--security-model MODEL] [--plan-only] [--security auto|true|false] "task"')
  process.exit(2)
}

const args = process.argv.slice(2)
const options = { planOnly: false, security: 'auto' }
const taskParts = []
const valueFlags = new Set(['--runtime', '--model', '--planner-model', '--coder-model', '--reviewer-model', '--security-model', '--security'])
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--plan-only') {
    options.planOnly = true
  } else if (valueFlags.has(arg)) {
    const value = args[++index]
    if (!value) usage()
    options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
  } else {
    taskParts.push(arg)
  }
}
const runtime = options.runtime
const task = taskParts.join(' ').trim()
if (!runtime || !task || !['codex', 'claude'].includes(runtime)) usage()
if (!['auto', 'true', 'false'].includes(options.security)) usage()

const root = resolve(new URL('..', import.meta.url).pathname)
const schemas = Object.fromEntries(['planner', 'security', 'coder', 'reviewer'].map(role => [role, resolve(root, 'schemas', `${role}.json`)]))
const adapter = runtime === 'codex' ? createCodexCliAdapter() : createClaudeCliAdapter()
const pipeline = createPipeline({
  adapter,
  prompt: buildPrompt,
  schemas,
  models: {
    planner: options.plannerModel || options.model,
    coder: options.coderModel || options.model,
    reviewer: options.reviewerModel || options.model,
    security: options.securityModel || options.model,
  },
  onEvent(event) { console.error(`[${event.role}] ${event.type}`) },
})

pipeline({ task, cwd: process.cwd(), planOnly: options.planOnly, security: options.security === 'auto' ? 'auto' : options.security === 'true' }).then(result => {
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.mode === 'plan-only' || result.approved ? 0 : 1
}).catch(error => {
  console.error(`LDO failed: ${error.message}`)
  process.exitCode = 1
})
