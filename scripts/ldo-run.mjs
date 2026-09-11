#!/usr/bin/env node
import { resolve } from 'node:path'
import { createClaudeCliAdapter } from '../adapters/claude-cli.mjs'
import { createCodexCliAdapter } from '../adapters/codex-cli.mjs'
import { createPipeline } from '../core/pipeline.mjs'
import { buildCodexPrompt, buildPrompt } from '../core/prompts.mjs'
import { createIsolatedWorktree } from '../core/isolation.mjs'

// The portable runtime has no complexity tier before Planner returns, so route
// by the nature of the role. Sol protects the high-consequence decisions and
// the source code; Terra is sufficient for bounded verification and research;
// Luna only writes the structured run record. CLI flags below always win.
const CODEX_DEFAULT_MODELS = {
  planner: 'gpt-5.6-sol',
  coder: 'gpt-5.6-sol',
  security: 'gpt-5.6-sol',
  reviewer: 'gpt-5.6-terra',
  researcher: 'gpt-5.6-terra',
  recorder: 'gpt-5.6-luna',
}

function usage() {
  console.error('Usage: node scripts/ldo-run.mjs --runtime codex|claude [--model MODEL] [--planner-model MODEL] [--researcher-model MODEL] [--coder-model MODEL] [--reviewer-model MODEL] [--security-model MODEL] [--recorder-model MODEL] [--research] [--plan-only] [--isolate] [--no-record] [--security auto|true|false] [--task "task"]... "task"')
  process.exit(2)
}

const args = process.argv.slice(2)
const options = { planOnly: false, isolate: false, research: false, record: true, security: 'auto' }
const taskParts = []
const tasks = []
const valueFlags = new Set(['--runtime', '--model', '--planner-model', '--researcher-model', '--coder-model', '--reviewer-model', '--security-model', '--recorder-model', '--security', '--task'])
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--no-record') {
    options.record = false
  } else if (arg === '--plan-only' || arg === '--isolate' || arg === '--research') {
    options[arg === '--plan-only' ? 'planOnly' : arg === '--isolate' ? 'isolate' : 'research'] = true
  } else if (valueFlags.has(arg)) {
    const value = args[++index]
    if (!value) usage()
    if (arg === '--task') tasks.push(value)
    else options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value
  } else {
    taskParts.push(arg)
  }
}
const runtime = options.runtime
const positionalTask = taskParts.join(' ').trim()
if (positionalTask) tasks.push(positionalTask)
if (!runtime || !tasks.length || !['codex', 'claude'].includes(runtime)) usage()
if (!['auto', 'true', 'false'].includes(options.security)) usage()

const root = resolve(new URL('..', import.meta.url).pathname)
const schemas = Object.fromEntries(['researcher', 'planner', 'security', 'coder', 'reviewer', 'recorder'].map(role => [role, resolve(root, 'schemas', `${role}.json`)]))
const adapter = runtime === 'codex' ? createCodexCliAdapter() : createClaudeCliAdapter()
const pipeline = createPipeline({
  adapter,
  // Claude retains its existing prompt exactly. Codex gets role-specific,
  // bounded handoffs because every phase is a fresh CLI context.
  prompt: runtime === 'codex' ? buildCodexPrompt : buildPrompt,
  schemas,
  models: {
    planner: options.plannerModel || options.model || CODEX_DEFAULT_MODELS.planner,
    researcher: options.researcherModel || options.model || CODEX_DEFAULT_MODELS.researcher,
    coder: options.coderModel || options.model || CODEX_DEFAULT_MODELS.coder,
    reviewer: options.reviewerModel || options.model || CODEX_DEFAULT_MODELS.reviewer,
    security: options.securityModel || options.model || CODEX_DEFAULT_MODELS.security,
    recorder: options.recorderModel || options.model || CODEX_DEFAULT_MODELS.recorder,
  },
  onEvent(event) { console.error(`[${event.role}] ${event.type}`) },
})

const originalCwd = process.cwd()
const multi = tasks.length > 1
const security = options.security === 'auto' ? 'auto' : options.security === 'true'

async function runTask(task, isolation) {
  const result = await pipeline({
    task,
    cwd: isolation?.path || originalCwd,
    planOnly: options.planOnly,
    research: options.research,
    record: options.record,
    isolation,
    security,
  })
  return { ...result, isolation }
}

async function main() {
  // Worktree creation is serial on purpose: each `git worktree add` is fast,
  // while creating `.worktrees/` and its .gitignore rule concurrently is a
  // filesystem race. Agent phases below still execute in parallel.
  const isolations = []
  if (multi || options.isolate) {
    for (const task of tasks) {
      const isolation = await createIsolatedWorktree({ cwd: originalCwd, task })
      console.error(`[isolate] verified ${isolation.path} (${isolation.branch})`)
      isolations.push(isolation)
    }
  }

  const results = await Promise.all(tasks.map((task, index) => runTask(task, isolations[index] || null)))
  if (!multi) return results[0]
  const approved = results.filter(result => result.approved).length
  const planned = results.filter(result => result.mode === 'plan-only').length
  return { mode: options.planOnly ? 'multi-plan-only' : 'multi', summary: { total: results.length, approved, planned }, features: results }
}

main().then(result => {
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.mode === 'plan-only' || result.mode === 'multi-plan-only' || result.approved ? 0 : 1
}).catch(error => {
  console.error(`LDO failed: ${error.message}`)
  process.exitCode = 1
})
