export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Research→]Plan→[Security→]Code⇄Review, with a different model per role',
  whenToUse: 'args.task runs one feature in the current directory. args.tasks (an array) runs N independent features in parallel, each isolated in its own git worktree created by that feature\'s Planner; each ships separately afterward via /ldo-ship run from its own worktree.',
  phases: [
    { title: 'Research', detail: 'Multi-source web research (opt-in)' },
    { title: 'Plan', detail: 'Read the codebase, plan the change, rate complexity + security surface' },
    { title: 'Security', detail: 'Threat-model the plan before code exists (elevated surface only)' },
    { title: 'Code', detail: 'Set up env, implement, test, document' },
    { title: 'Review', detail: 'Read the diff, drive the app, prove the criteria' },
    { title: 'Record', detail: 'Persist the review report, architecture doc, backlog (approved medium+ only)' },
  ],
}

// ═══════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    complexity: { type: 'string', enum: ['trivial', 'medium', 'complex'] },
    security_surface: {
      type: 'string',
      enum: ['none', 'low', 'elevated'],
      description: 'none = no attack surface; low = data paths, no new entry point; elevated = new input/auth/secrets/injection/dependency/crypto surface',
    },
    security_notes: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    codebase_context: {
      type: 'object',
      description: 'The ONLY codebase information downstream agents receive. Becomes the shared cache prefix.',
      properties: {
        stack: { type: 'string', description: 'Language, framework, package manager, test framework, database' },
        conventions: { type: 'string', description: 'Patterns the Coder must match. 3-8 lines.' },
        relevant_files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              role: { type: 'string', enum: ['primary', 'dependent', 'test', 'config'] },
              note: { type: 'string' },
            },
            required: ['path', 'role'],
          },
        },
        test_command: { type: 'string' },
        run_command: { type: 'string', description: 'How to start the app; null if not runnable' },
      },
      required: ['stack', 'relevant_files'],
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          acceptance: { type: 'string' },
          user_facing: { type: 'boolean' },
        },
        required: ['what', 'files', 'acceptance'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string' },
    worktree_path: { type: 'string', description: 'Populated only in multi-feature mode — the exact path the Planner cd\'d into' },
    branch: { type: 'string', description: 'Populated only in multi-feature mode — the exact branch the Planner created' },
  },
  required: ['complexity', 'summary', 'steps', 'codebase_context'],
}

const CODER_SCHEMA = {
  type: 'object',
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tests: {
      type: 'object',
      properties: {
        written: { type: 'array', items: { type: 'string' } },
        updated: { type: 'array', items: { type: 'string' } },
        result: { type: 'string', description: 'e.g. "42 passed, 0 failed"' },
        pre_existing_failures: { type: 'array', items: { type: 'string' } },
      },
    },
    env: {
      type: 'object',
      properties: {
        actions: { type: 'array', items: { type: 'string' } },
        unresolved: { type: 'array', items: { type: 'string' } },
      },
    },
    docs_updated: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
  },
  required: ['files_changed', 'summary'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['approved', 'changes_requested'] },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          what: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['file', 'severity', 'what', 'suggestion'],
      },
    },
    verification: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['verified', 'partial', 'failed', 'nothing_to_drive'] },
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              criterion: { type: 'string' },
              status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
              evidence: { type: 'string' },
              note: { type: 'string' },
            },
            required: ['criterion', 'status', 'evidence'],
          },
        },
        blockers: { type: 'array', items: { type: 'string' } },
      },
    },
    attacks: {
      type: 'array',
      description: 'What the Reviewer actively tried to break, and whether it held',
      items: {
        type: 'object',
        properties: {
          vector: { type: 'string', description: 'The input or condition tried' },
          outcome: { type: 'string', enum: ['broke', 'held'] },
          evidence: { type: 'string', description: 'Command and captured output' },
        },
        required: ['vector', 'outcome'],
      },
    },
  },
  required: ['status', 'summary'],
}

const SECURITY_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['clean', 'findings'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category: { type: 'string', enum: ['injection', 'auth', 'data_exposure', 'input_validation', 'ssrf', 'supply_chain', 'crypto', 'race_condition', 'resource', 'config'] },
          plan_step: { type: 'string' },
          what: { type: 'string' },
          exploit_scenario: { type: 'string' },
          mitigation: { type: 'string' },
          cwe: { type: 'string' },
        },
        required: ['severity', 'category', 'what', 'exploit_scenario', 'mitigation'],
      },
    },
    threat_model_notes: { type: 'string' },
  },
  required: ['status', 'summary'],
}

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sources: { type: 'array', items: { type: 'string' } },
          contradictions: { type: 'string' },
        },
        required: ['claim', 'confidence', 'sources'],
      },
    },
    recommendations: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['question', 'summary', 'findings'],
}

// ═══════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════

// The Planner's codebase_context becomes the shared cache prefix. Anthropic keys
// the prompt cache on (model_id + prefix_bytes): Coder and Reviewer on the same
// model both hit it. A different reviewer model means a separate namespace and
// one cold start — usually worth it for the independent read.
function renderContext(ctx) {
  if (!ctx) return ''
  const parts = ['## PROJECT CONTEXT']
  if (ctx.stack) parts.push('### Stack\n' + ctx.stack)
  if (ctx.conventions) parts.push('### Conventions\n' + ctx.conventions)
  if (ctx.relevant_files?.length) {
    parts.push('### Files\n' + ctx.relevant_files
      .map(f => `- \`${f.path}\` (${f.role})${f.note ? ` — ${f.note}` : ''}`)
      .join('\n'))
  }
  const cmds = []
  if (ctx.test_command) cmds.push(`- test: \`${ctx.test_command}\``)
  if (ctx.run_command) cmds.push(`- run: \`${ctx.run_command}\``)
  if (cmds.length) parts.push('### Commands\n' + cmds.join('\n'))
  return parts.join('\n') + '\n\n'
}

function renderPlan(plan) {
  const lines = [`## PLAN (${plan.complexity})`, plan.summary, '', '### Steps']
  plan.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.what}`)
    lines.push(`   Files: ${s.files.join(', ')}`)
    lines.push(`   Accept: ${s.acceptance}`)
  })
  if (plan.risks?.length) {
    lines.push('', '### Risks')
    plan.risks.forEach(r => lines.push(`- ${r}`))
  }
  if (plan.rollback_plan) lines.push('', '### Rollback', plan.rollback_plan)
  return lines.join('\n')
}

function renderPlanCompact(plan) {
  return plan.steps.map((s, i) => `${i + 1}. ${s.what} [${s.files.join(', ')}]`).join('\n')
}

function renderCoderSummary(r) {
  if (!r) return '(No summary)'
  if (typeof r === 'string') return r
  const lines = [`**Files changed**: ${r.files_changed?.join(', ') || '(none)'}`]
  if (r.summary) lines.push(`**Summary**: ${r.summary}`)
  if (r.tests?.result) lines.push(`**Tests**: ${r.tests.result}`)
  const t = [...(r.tests?.written || []), ...(r.tests?.updated || [])]
  if (t.length) lines.push(`**Test files**: ${t.join(', ')}`)
  if (r.tests?.pre_existing_failures?.length) lines.push(`**Pre-existing failures**: ${r.tests.pre_existing_failures.join('; ')}`)
  if (r.env?.actions?.length) lines.push(`**Env actions**: ${r.env.actions.join('; ')}`)
  if (r.env?.unresolved?.length) lines.push(`**Env unresolved**: ${r.env.unresolved.join('; ')}`)
  if (r.docs_updated?.length) lines.push(`**Docs**: ${r.docs_updated.join(', ')}`)
  if (r.deviations?.length) lines.push(`**Deviations**: ${r.deviations.join('; ')}`)
  return lines.join('\n')
}

// Full threat model when the Security agent ran; otherwise the Planner's own
// notes, so a `low` surface still reaches the Coder without an extra agent.
function renderSecurity(sec, plan) {
  if (sec?.status === 'findings' && sec.findings?.length) {
    const lines = ['## SECURITY THREAT MODEL (mitigations are hard requirements)']
    sec.findings.forEach((f, i) => {
      const stepRef = f.plan_step ? ` (plan step: ${f.plan_step})` : ''
      lines.push(`${i + 1}. [${f.severity}] ${f.category}: ${f.what}${stepRef}`)
      lines.push(`   Mitigation: ${f.mitigation}`)
    })
    if (sec.threat_model_notes) lines.push(`\nNotes: ${sec.threat_model_notes}`)
    return lines.join('\n') + '\n\n'
  }
  if (!sec && plan?.security_notes?.length && plan.security_surface !== 'none') {
    return '## SECURITY NOTES (handle these carefully)\n'
      + plan.security_notes.map(n => `- ${n}`).join('\n') + '\n\n'
  }
  return ''
}

// Multi-feature isolation. Suggested paths/branches are always derived through
// slugify() before they're ever interpolated into a prompt as a literal shell
// command — an operator-supplied label lands in "git worktree add <this>", so it
// must be shell-safe by construction, not by hoping the agent notices.
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/

function slugify(text, fallback) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return SAFE_SLUG.test(s) ? s : fallback
}

function renderWorktree(worktreePath, branch) {
  if (!worktreePath || !branch) return ''
  return `## ISOLATION\nYour work happens in \`${worktreePath}\` on branch \`${branch}\`. cd there before anything else and verify with \`pwd\` / \`git rev-parse --show-toplevel\`. Other features are running in sibling worktrees right now — never touch the main tree or another feature's directory.\n\n`
}

function renderResearch(r) {
  if (!r) return ''
  const lines = ['## RESEARCH FINDINGS', r.summary, '']
  if (r.findings?.length) {
    lines.push('### Findings')
    r.findings.forEach(f => lines.push(`- [${f.confidence}] ${f.claim}`))
  }
  if (r.recommendations?.length) {
    lines.push('', '### Recommendations')
    r.recommendations.forEach(x => lines.push(`- ${x}`))
  }
  if (r.gaps?.length) lines.push('', '### Unanswered\n' + r.gaps.map(g => `- ${g}`).join('\n'))
  return lines.join('\n') + '\n\n'
}

// ═══════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════

// The reason the protocol exists: Reviewer runs on a stronger model than Coder.
// Model names mean whatever your setup routes them to — no assumption is made
// about which is more capable.
//
// The tiers genuinely differ. A typo doesn't need Sonnet to plan it or Opus to
// review it, so trivial work runs cheap end to end. Medium is the default shape:
// Sonnet writes, Opus checks. Complex additionally buys a stronger Planner,
// because a wrong approach is the expensive kind of wrong.
const DEFAULT_MODELS = {
  trivial: { planner: 'haiku',  coder: 'haiku',  reviewer: 'sonnet', security: 'opus', researcher: 'sonnet', recorder: 'haiku' },
  medium:  { planner: 'sonnet', coder: 'sonnet', reviewer: 'opus',   security: 'opus', researcher: 'opus',   recorder: 'haiku' },
  complex: { planner: 'opus',   coder: 'sonnet', reviewer: 'opus',   security: 'opus', researcher: 'opus',   recorder: 'haiku' },
}

function routeModels(complexity, config) {
  const table = config?.models ? { ...DEFAULT_MODELS, ...config.models } : DEFAULT_MODELS
  return table[complexity] || table.medium
}

// One transient failure shouldn't abort a run that has already done real work
async function agentWithRetry(prompt, opts, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    const result = await agent(prompt, opts)
    if (result) return result
    if (i < attempts - 1) log(`  ↻ ${opts.label} returned nothing — retrying (${i + 2}/${attempts})`)
  }
  return null
}

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const CONFIG = args?.config || {}
const MAX_FIX_LOOPS = CONFIG.maxFixLoops || 3
const BLOCKING_SEVERITIES = CONFIG.blockingSeverities || ['critical', 'major']
const DO_RESEARCH = args?.research ?? CONFIG.researchByDefault ?? false
const MAX_PARALLEL_FEATURES = CONFIG.maxParallelFeatures || 12

// Parses args.tasks into {task, label}[] with unique labels, or null if this
// isn't a multi-feature run (falls through to the single-task path below).
// Labels come from an explicit `label` field or slugify(task); collisions get
// -2, -3, ... suffixes, same convention as the Recorder's file naming.
function normalizeTasks(a) {
  const raw = a?.tasks
  if (!Array.isArray(raw) || raw.length === 0) return null

  const seen = new Map()
  return raw.map((entry, i) => {
    const t = typeof entry === 'string' ? entry : entry?.task
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error(`tasks[${i}] is malformed — expected a string or {task, label?}`)
    }
    const requestedLabel = typeof entry === 'object' ? entry.label : null
    let label = slugify(requestedLabel || t, `feature-${i + 1}`)
    const n = (seen.get(label) || 0) + 1
    seen.set(label, n)
    if (n > 1) label = `${label}-${n}`
    return { task: t, label }
  })
}

// Security is gated on attack surface, not task size — a one-line change to an
// auth check is trivial work with elevated risk. The Planner rates this; the
// dedicated agent runs only when that rating is `elevated`.
function securityEnabled(plan) {
  if (args?.security !== undefined) return args.security
  if (CONFIG.securityByDefault !== undefined) return CONFIG.securityByDefault
  return plan.security_surface === 'elevated'
}

// Research and Plan run before complexity is known — resolve their models up front
const prePlanModels = routeModels('medium', CONFIG)

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

// The single-task path and the multi-feature path share this function. Single
// mode calls it once with ctx.isMulti = false. Multi mode calls it N times
// through parallel(), one closure per feature — every let/const below is
// scoped inside the function, so N concurrent calls each get their own copy
// instead of racing on shared state. Never throws: a failure inside becomes a
// returned {error, ...} object for that feature, so one bad feature can't
// abort the others running alongside it under parallel().
async function runOneFeature(task, ctx) {
try {
  // Used to prefix every log line below with the feature's label in multi
  // mode, so N concurrent features' output stays distinguishable in one
  // interleaved stream. Empty in single mode — behavior there is unchanged.
  const logPrefix = ctx.isMulti ? `[${ctx.label}] ` : ''

  log(`Budget: ${budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unlimited'}`)
  log(`${logPrefix}Task: ${task.slice(0, 200)}${task.length > 200 ? '...' : ''}`)

  // In multi mode, phase() is a shared run-global progress indicator — N
  // concurrent features calling it would each stomp the others' display.
  // logStage replaces it with a labelled log line; single mode is unaffected.
  const logStage = (title) => {
    if (ctx.isMulti) log(`[${ctx.label}] ▸ ${title}`)
    else phase(title)
  }

// ── RESEARCH (opt-in) ───────────────────────

let researchReport = null

if (DO_RESEARCH) {
  logStage('Research')

  researchReport = await agent(
    `Deep-research this topic. Cross-verify claims across independent sources.\n\n## TOPIC\n${task}`,
    { label: ctx.isMulti ? `${ctx.label}:researcher` : 'researcher', phase: 'Research', model: prePlanModels.researcher, agentType: 'ldo:researcher', schema: RESEARCH_SCHEMA }
  )

  if (researchReport) {
    const high = researchReport.findings?.filter(f => f.confidence === 'high').length || 0
    log(`${logPrefix}Research: ${researchReport.findings?.length || 0} findings (${high} high-confidence), ${researchReport.recommendations?.length || 0} recommendations`)
  } else {
    log(`${logPrefix}⚠ Research returned nothing — proceeding without it.`)
  }
}

// ── PLAN ────────────────────────────────────

logStage('Plan')

// In multi mode the Planner creates its own isolated worktree via Bash before
// reading the codebase — the workflow script itself has no filesystem access.
// The suggestion is deterministic (index-derived), not trusted to the LLM to
// keep collision-free across similar task strings.
const worktreeTrigger = ctx.isMulti
  ? `This run is part of a parallel multi-feature batch. Before reading the codebase, create your own isolated worktree:\n\n\`git worktree add ${ctx.worktreeHint.suggestedPath} -b ${ctx.worktreeHint.suggestedBranch}\`\n\nThen \`cd\` into it and do all your work there. Only deviate from this path/branch if it collides with something that already exists. Report the exact worktree_path and branch you used.\n\n`
  : ''

const plan = await agentWithRetry(
  worktreeTrigger + renderResearch(researchReport) + `Read the codebase and plan this task.\n\n## TASK\n${task}`,
  { label: ctx.isMulti ? `${ctx.label}:planner` : 'planner', phase: 'Plan', model: prePlanModels.planner, agentType: 'ldo:planner', schema: PLAN_SCHEMA }
)

if (!plan) {
  log(`${logPrefix}ERROR: Planner failed.`)
  return { error: 'Planner failed', label: ctx.label, task }
}

if (ctx.isMulti && (!plan.worktree_path || !plan.branch)) {
  log(`${logPrefix}ERROR: Planner didn't report a worktree — refusing to continue agents into an undefined directory.`)
  return { error: 'Planner did not create/report a worktree in multi-feature mode', label: ctx.label, task, plan }
}

const models = routeModels(plan.complexity, CONFIG)
const CTX = renderContext(plan.codebase_context)
const surface = plan.security_surface || 'unrated'
const DO_SECURITY = securityEnabled(plan)
const WORKTREE_BLOCK = ctx.isMulti ? renderWorktree(plan.worktree_path, plan.branch) : ''

log(`${logPrefix}Complexity: ${plan.complexity}  |  Security surface: ${surface}  |  Coder:${models.coder}  Reviewer:${models.reviewer}`)
if (ctx.isMulti) log(`${logPrefix}Worktree: ${plan.worktree_path} (${plan.branch})`)
if (surface !== 'none' && plan.security_notes?.length) {
  plan.security_notes.forEach(n => log(`${logPrefix}  ⚠ ${n}`))
}
log(`${logPrefix}Plan: ${plan.steps.length} step(s), ${plan.codebase_context?.relevant_files?.length || 0} files mapped`)
plan.steps.forEach(s => log(`${logPrefix}  • ${s.what}`))

// ── SECURITY (elevated surface only) ────────

let securityReport = null

if (DO_SECURITY) {
  logStage('Security')

  const flagged = plan.security_notes?.length
    ? `\n\n## SURFACE THE PLANNER FLAGGED\n${plan.security_notes.map(n => `- ${n}`).join('\n')}\n\nStart from these, then look for what the Planner missed.`
    : ''

  securityReport = await agent(
    WORKTREE_BLOCK + CTX + `Threat-model this implementation plan. No code exists yet — identify risks before they are written.\n\n${renderPlan(plan)}${flagged}`,
    { label: ctx.isMulti ? `${ctx.label}:security` : 'security', phase: 'Security', model: models.security, agentType: 'ldo:security', schema: SECURITY_SCHEMA }
  )

  if (securityReport) {
    log(`${logPrefix}Security: ${securityReport.status} — ${securityReport.summary}`)
    securityReport.findings?.forEach(f => log(`${logPrefix}  [${f.severity}] ${f.category}: ${f.what}`))
  } else {
    log(`${logPrefix}⚠ Security returned nothing — proceeding without threat model.`)
  }
}

const SECURITY_BLOCK = renderSecurity(securityReport, plan)

// ── CODE ⇄ REVIEW ───────────────────────────

let iteration = 0
let reviewIssues = []
let finalVerdict = null
let lastIssues = []

while (iteration < MAX_FIX_LOOPS) {
  const isFirstPass = iteration === 0

  logStage('Code')

  const coderPrompt = isFirstPass
    ? WORKTREE_BLOCK + CTX + SECURITY_BLOCK + `Set up the environment, then execute this plan. The PROJECT CONTEXT above is your map — don't re-scan the repo.\n\n${renderPlan(plan)}`
    : WORKTREE_BLOCK + `Fix the review issues below. Narrow pass — touch only these files.\n\n## ISSUES\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}\n   → ${iss.suggestion}`).join('\n\n')}\n\n## PLAN (context)\n${renderPlanCompact(plan)}`

  const coderLabel = isFirstPass ? 'coder' : `coder-fix-${iteration}`
  const coderResult = await agent(coderPrompt, {
    label: ctx.isMulti ? `${ctx.label}:${coderLabel}` : coderLabel,
    phase: 'Code',
    model: models.coder,
    agentType: 'ldo:coder',
    schema: CODER_SCHEMA,
  })

  if (coderResult?.tests?.result) log(`${logPrefix}Coder pass ${iteration + 1}: ${coderResult.tests.result}`)
  else log(`${logPrefix}Coder pass ${iteration + 1} complete`)
  if (coderResult?.env?.unresolved?.length) log(`${logPrefix}  ⚠ Env: ${coderResult.env.unresolved.join('; ')}`)

  logStage('Review')

  // First pass gets the full treatment: verify the criteria, then actively try to
  // break it. Fix passes are narrow — re-attacking the whole surface each round
  // would triple the cost of a loop that exists to close specific issues.
  const reviewerPrompt = isFirstPass
    ? WORKTREE_BLOCK + CTX + SECURITY_BLOCK + `Review this implementation against the plan, drive the app to prove the acceptance criteria, then try to break it.\n\n${renderPlan(plan)}\n\n## CODER'S SUMMARY\n${renderCoderSummary(coderResult)}`
    : WORKTREE_BLOCK + `Verify these fixes landed, and scan for new problems introduced by them. Re-run any attack that previously broke something; no need to repeat the ones that held.\n\n## ISSUES TO VERIFY\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}\n\n## CODER'S FIX SUMMARY\n${renderCoderSummary(coderResult)}`

  const reviewerLabel = isFirstPass ? 'reviewer' : `reviewer-${iteration}`
  const verdict = await agent(reviewerPrompt, {
    label: ctx.isMulti ? `${ctx.label}:${reviewerLabel}` : reviewerLabel,
    phase: 'Review',
    model: models.reviewer,
    agentType: 'ldo:reviewer',
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) {
    log(`${logPrefix}ERROR: Reviewer failed.`)
    return { error: 'Reviewer failed', plan, label: ctx.label, task }
  }

  const v = verdict.verification
  if (v) {
    const passed = v.criteria?.filter(c => c.status === 'passed').length || 0
    const total = v.criteria?.length || 0
    log(`${logPrefix}Verification: ${v.verdict}${total ? ` — ${passed}/${total} criteria proven` : ''}`)
    v.criteria?.filter(c => c.status !== 'passed').forEach(c => {
      const mark = c.status === 'failed' ? '✗' : '○' // skipped/other
      log(`${logPrefix}  ${mark} ${c.criterion}${c.note ? ` — ${c.note}` : ''}`)
    })
    if (v.blockers?.length) log(`${logPrefix}  ⚠ Blockers: ${v.blockers.join('; ')}`)
  }

  // Surface what was attacked — an empty attack list on a runnable change means
  // the Reviewer only checked the happy path, which is worth noticing.
  const atk = verdict.attacks || []
  if (atk.length) {
    const broke = atk.filter(a => a.outcome === 'broke')
    log(`${logPrefix}Attacks: ${atk.length} tried, ${broke.length} broke it`)
    broke.forEach(a => log(`${logPrefix}  ✗ ${a.vector}`))
  }

  lastIssues = verdict.issues || []

  if (verdict.status === 'approved') {
    finalVerdict = verdict
    log(`${logPrefix}✓ APPROVED — ${verdict.summary}`)
    break
  }

  // Only critical/major buy another pass; minor and nit ride along in the report
  const blocking = lastIssues.filter(i => BLOCKING_SEVERITIES.includes(i.severity))
  const advisory = lastIssues.filter(i => !BLOCKING_SEVERITIES.includes(i.severity))

  log(`${logPrefix}✗ ${lastIssues.length} issue(s): ${blocking.length} blocking, ${advisory.length} advisory`)
  lastIssues.forEach(iss => log(`${logPrefix}  [${iss.severity}] ${iss.file}: ${iss.what}`))

  if (blocking.length === 0) {
    finalVerdict = { ...verdict, status: 'approved', summary: `${verdict.summary} (${advisory.length} advisory issue(s) left unfixed)` }
    log(`${logPrefix}✓ APPROVED — no blocking issues remain`)
    break
  }

  reviewIssues = blocking
  iteration++
}

if (!finalVerdict) {
  log(`${logPrefix}⚠ Max fix loops (${MAX_FIX_LOOPS}) exhausted.`)
  finalVerdict = { status: 'changes_requested', summary: `Max ${MAX_FIX_LOOPS} fix iterations reached.`, issues: lastIssues }
}

const approved = finalVerdict.status === 'approved'

// ── RECORD ──────────────────────────────────

// The pipeline produced rich structured results — plan, verdict, evidence,
// attacks — but none of them are on disk. The workflow can't write files
// (runtime constraint), so a cheap formatting agent does it: review report
// with receipts, architecture doc, backlog items. Only when approved and only
// when the work was substantial enough to warrant a paper trail.
if (approved && plan.complexity !== 'trivial') {
  logStage('Record')

  const recordPrompt = WORKTREE_BLOCK + `Persist this run's results to the repo. Write the review report with full evidence, update the architecture doc, and create backlog items for anything unfixed.

## TASK
${task}

## PLAN
${renderPlan(plan)}

## VERDICT
${finalVerdict.status.toUpperCase()} — ${finalVerdict.summary}

## VERIFICATION
${(finalVerdict.verification?.criteria || []).map((c, i) => `${i + 1}. [${c.status}] ${c.criterion}\n   Evidence: ${c.evidence || '(none)'}`).join('\n')}

## ATTACKS
${(finalVerdict.attacks || []).map((a, i) => `${i + 1}. [${a.outcome}] ${a.vector}\n   Evidence: ${a.evidence || '(none)'}`).join('\n')}

## ISSUES
All: ${(finalVerdict.issues || []).map(iss => `[${iss.severity}] ${iss.file}: ${iss.what} → ${iss.suggestion}`).join('; ') || 'none'}

## SECURITY (if any)
${securityReport?.status === 'findings' ? securityReport.findings.map(f => `[${f.severity}] ${f.category}: ${f.what} → ${f.mitigation}`).join('\n') : 'none'}`

  const recordResult = await agent(recordPrompt, {
    label: ctx.isMulti ? `${ctx.label}:recorder` : 'recorder',
    phase: 'Record',
    model: models.recorder || 'haiku',
    agentType: 'ldo:recorder',
  })

  if (recordResult) {
    log(`${logPrefix}Record: ${recordResult.slice(0, 120)}`)
  } else {
    log(`${logPrefix}⚠ Recorder returned nothing — artifacts not persisted.`)
  }
}

// ── RESULT ──────────────────────────────────

// Result shape follows agent-ux: verdict first, then detail. A reader scanning
// the returned object gets the answer in the first field, not buried after the input.
return {
  approved,
  label: ctx.label,
  worktree_path: plan.worktree_path || null,
  branch: plan.branch || null,
  verdict: finalVerdict,
  verification: finalVerdict.verification?.verdict || 'not_run',
  attacks: finalVerdict.attacks || [],
  stats: {
    complexity: plan.complexity,
    securitySurface: surface,
    securityStatus: securityReport?.status || 'not_run',
    models,
    coder_passes: iteration + 1,
    researched: !!researchReport,
    files_mapped: plan.codebase_context?.relevant_files?.length || 0,
  },
  plan,
  researchReport,
  securityReport,
  task,
}
} catch (err) {
  // A thrown error inside one feature must not abort siblings running under
  // parallel() — return a failure shape instead of letting it propagate.
  log(`${ctx?.isMulti ? `[${ctx.label}] ` : ''}ERROR: ${err?.message || err}`)
  return { error: String(err?.message || err), label: ctx?.label, task, approved: false }
}
}

// ── DISPATCH ────────────────────────────────

let tasksList
try {
  tasksList = normalizeTasks(args)
} catch (err) {
  log(`ERROR: ${err.message}`)
  return { error: err.message }
}

if (tasksList) {
  // Parallel multi-feature mode. Each feature gets its own git worktree, created
  // by that feature's Planner (the workflow script has no filesystem access).
  // Cost and merge-conflict handling are accepted trade-offs, not solved here —
  // this is comparable to N developers on N branches; conflicts are routine at
  // merge time, not something the orchestrator resolves.
  if (tasksList.length > MAX_PARALLEL_FEATURES) {
    log(`⚠ ${tasksList.length} features requested, exceeds maxParallelFeatures (${MAX_PARALLEL_FEATURES}) — likely unintentional, but proceeding.`)
  }

  log(`Multi-feature run: ${tasksList.length} feature(s), each isolated in its own git worktree.`)
  tasksList.forEach((t, i) => log(`  [${t.label}] ${t.task.slice(0, 100)}${t.task.length > 100 ? '...' : ''}`))

  const results = await parallel(tasksList.map((t, i) => () => runOneFeature(t.task, {
    index: i,
    total: tasksList.length,
    label: t.label,
    isMulti: true,
    worktreeHint: {
      suggestedPath: `.worktrees/${i + 1}-${t.label}`,
      suggestedBranch: `ldo/${i + 1}-${t.label}`,
    },
  })))

  const features = results.map((r, i) => r || { error: 'No result returned', label: tasksList[i].label, task: tasksList[i].task, approved: false })
  const approved = features.filter(f => f.approved).length
  const failed = features.filter(f => f.error || !f.verdict).length
  const changesRequested = features.length - approved - failed

  log('')
  log(`Multi-feature summary: ${approved}/${features.length} approved, ${changesRequested} changes requested, ${failed} failed`)
  features.forEach(f => {
    if (f.worktree_path) log(`  [${f.label}] ${f.approved ? '✓' : '✗'} → run /ldo-ship from ${f.worktree_path} (already on ${f.branch})`)
    else log(`  [${f.label}] ✗ ${f.error || 'no worktree — see error above'}`)
  })
  if (budget.total) log(`Budget remaining: ${Math.round(budget.remaining() / 1000)}k`)

  return {
    mode: 'multi',
    summary: { total: features.length, approved, changesRequested, failed },
    features,
  }
}

// Single-task mode.
const singleTask = args?.task || (typeof args === 'string' ? args : null)

if (!singleTask) {
  log('ERROR: No task provided. Workflow({name:"ldo", args:{task:"..."}}) or {tasks:[...]} for parallel features.')
  return { error: 'No task provided' }
}

return await runOneFeature(singleTask, { isMulti: false })
