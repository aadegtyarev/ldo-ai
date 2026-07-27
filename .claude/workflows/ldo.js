export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Bootstrap→]Scout→[Explore→][Research→]Plan→[Security→]Code⇄Review→Setup→[Verify→]Docs',
  phases: [
    { title: 'Bootstrap', detail: 'Greenfield: research, stack, roadmap' },
    { title: 'Scout', detail: 'Read codebase ONCE → deterministic snapshot (cache-stable)' },
    { title: 'Explore', detail: 'Task-specific codebase search (opt-in)' },
    { title: 'Research', detail: 'Deep web research on topic (opt-in)' },
    { title: 'Plan', detail: 'Task + snapshot → plan (no codebase re-read)' },
    { title: 'Security', detail: 'Threat model the PLAN before coding (opt-in)' },
    { title: 'Code', detail: 'Implement plan, write tests' },
    { title: 'Review', detail: 'Plan compliance + correctness + simplification' },
    { title: 'Setup', detail: 'Install deps, configure env' },
    { title: 'Verify', detail: 'Drive the app, prove acceptance criteria (opt-in)' },
    { title: 'Docs', detail: 'Write/update docs' },
  ],
}

// ═══════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════

const CTX_SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    structure: { type: 'string', description: 'Key directories and their purposes. 10-20 lines.' },
    stack: { type: 'string', description: 'One line per: language, framework, package_manager, test_framework, database, build_tool' },
    conventions: { type: 'string', description: 'Coding patterns, naming rules, file organization. 5-10 lines.' },
    key_files: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, purpose: { type: 'string' } },
        required: ['path', 'purpose'],
      },
    },
    entry_points: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'string', description: 'Key third-party packages in use (one line)' },
  },
  required: ['structure', 'stack', 'key_files'],
}

const EXPLORE_SCHEMA = {
  type: 'object',
  properties: {
    relevant_files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          why: { type: 'string' },
          role: { type: 'string', enum: ['primary', 'dependent', 'test', 'config'] },
        },
        required: ['path', 'why', 'role'],
      },
    },
    call_sites: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, what: { type: 'string' } },
        required: ['path', 'what'],
      },
    },
    existing_tests: { type: 'array', items: { type: 'string' } },
    tricky_spots: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, concern: { type: 'string' } },
        required: ['path', 'concern'],
      },
    },
    summary: { type: 'string', description: '2-3 sentences on where the logic lives' },
  },
  required: ['relevant_files', 'summary'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    complexity: { type: 'string', enum: ['trivial', 'medium', 'complex'] },
    summary: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          acceptance: { type: 'string' },
          user_facing: { type: 'boolean', description: 'True if affects users (needs docs, changelog)' },
        },
        required: ['what', 'files', 'acceptance'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    rollback_plan: { type: 'string', description: 'How to revert if this goes wrong (required for complex tasks)' },
  },
  required: ['complexity', 'summary', 'steps'],
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
  },
  required: ['status', 'summary'],
}

const CODER_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    tests: {
      type: 'object',
      properties: {
        written: { type: 'array', items: { type: 'string' } },
        updated: { type: 'array', items: { type: 'string' } },
      },
    },
    deviations: { type: 'array', items: { type: 'string' } },
  },
  required: ['files_changed', 'summary'],
}

const BOOTSTRAP_SCHEMA = {
  type: 'object',
  properties: {
    idea: {
      type: 'object',
      properties: { one_liner: {}, problem: {}, audience: {}, mvp_scope: {} },
      required: ['one_liner', 'problem'],
    },
    research: {
      type: 'object',
      properties: {
        similar_open_source: { type: 'array', items: { type: 'object', properties: { name: {}, url: {}, strengths: {}, gaps: {} }, required: ['name', 'url'] } },
        commercial_competitors: { type: 'array', items: { type: 'object', properties: { name: {}, url: {}, strengths: {}, gaps: {} }, required: ['name', 'url'] } },
        relevant_libraries: { type: 'array', items: { type: 'object', properties: { name: {}, url: {}, purpose: {} }, required: ['name', 'purpose'] } },
      },
    },
    stack: {
      type: 'object',
      properties: {
        language: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        framework: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        database: { type: 'object', properties: { choice: {}, rationale: {}, alternative: {} } },
        infrastructure: { type: 'object', properties: { choice: {}, rationale: {} } },
        key_libraries: { type: 'array', items: { type: 'object', properties: { name: {}, purpose: {} } } },
      },
    },
    roadmap: { type: 'array', items: { type: 'object', properties: { phase: {}, deliverables: { type: 'array', items: { type: 'string' } } }, required: ['phase', 'deliverables'] } },
    risks: { type: 'array', items: { type: 'string' } },
    next_action: { type: 'string' },
  },
  required: ['idea', 'roadmap', 'next_action'],
}

const ENV_SETUP_SCHEMA = {
  type: 'object',
  properties: {
    project_type: { type: 'string' },
    dependencies_installed: { type: 'array', items: { type: 'string' } },
    services_started: { type: 'array', items: { type: 'string' } },
    env_vars_configured: { type: 'array', items: { type: 'string' } },
    issues_found: { type: 'array', items: { type: 'string' } },
    issues_fixed: { type: 'array', items: { type: 'string' } },
    unresolved: { type: 'array', items: { type: 'string' } },
    runnable: { type: 'boolean' },
    start_command: { type: 'string' },
  },
  required: ['project_type', 'runnable'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['verified', 'partial', 'failed', 'not_verifiable'] },
    summary: { type: 'string' },
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
  required: ['verdict', 'summary'],
}

const DOCS_SCHEMA = {
  type: 'object',
  properties: {
    files_changed: { type: 'array', items: { type: 'string' } },
    sections_updated: { type: 'array', items: { type: 'object', properties: { file: {}, section: {}, summary: {} }, required: ['file', 'section', 'summary'] } },
    new_files: { type: 'array', items: { type: 'string' } },
    docs_written: { type: 'string' },
    skipped: { type: 'array', items: { type: 'string' } },
  },
  required: ['files_changed', 'docs_written'],
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
    source_list: {
      type: 'array',
      items: { type: 'object', properties: { url: {}, title: {}, relevance: {} }, required: ['url', 'title'] },
    },
  },
  required: ['question', 'summary', 'findings'],
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

// ═══════════════════════════════════════════
// CONTEXT CACHE
// ═══════════════════════════════════════════

// CTX is the shared cache prefix, built once from CtxScout's snapshot.
// Anthropic prompt cache keys on (model_id + prefix_bytes):
//   same model + same CTX = HIT (~10× cheaper input)
//   different model       = MISS (separate cache namespace)
// On resume, Scout is skipped (resumeFromRunId) → CTX bytes identical → hits persist.

function renderContext(ctx) {
  if (!ctx) return ''
  const parts = ['## PROJECT CONTEXT']
  if (ctx.structure)    parts.push('### Structure\n' + ctx.structure)
  if (ctx.stack)        parts.push('### Stack\n' + ctx.stack)
  if (ctx.conventions)  parts.push('### Conventions\n' + ctx.conventions)
  if (ctx.key_files?.length) parts.push('### Key Files\n' + ctx.key_files.map(f => `- \`${f.path}\` — ${f.purpose}`).join('\n'))
  if (ctx.dependencies) parts.push('### Dependencies\n' + ctx.dependencies)
  if (ctx.entry_points?.length) parts.push('### Entry Points\n' + ctx.entry_points.map(e => `- \`${e}\``).join('\n'))
  return parts.join('\n') + '\n\n'
}

// Setup and Verify only need structure + stack + entry points
function renderRuntimeContext(ctx) {
  if (!ctx) return ''
  const parts = []
  if (ctx.structure)    parts.push('### Structure\n' + ctx.structure)
  if (ctx.stack)        parts.push('### Stack\n' + ctx.stack)
  if (ctx.entry_points?.length) parts.push('### Entry Points\n' + ctx.entry_points.map(e => `- \`${e}\``).join('\n'))
  return parts.length ? '## PROJECT CONTEXT\n' + parts.join('\n') + '\n\n' : ''
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

function renderCoderSummary(result) {
  if (!result) return '(No summary)'
  if (typeof result === 'string') return result
  const lines = [`**Files changed**: ${result.files_changed?.join(', ') || '(none)'}`]
  if (result.summary) lines.push(`**Summary**: ${result.summary}`)
  if (result.tests?.written?.length) lines.push(`**Tests written**: ${result.tests.written.join(', ')}`)
  if (result.tests?.updated?.length) lines.push(`**Tests updated**: ${result.tests.updated.join(', ')}`)
  if (result.deviations?.length) lines.push(`**Deviations**: ${result.deviations.join('; ')}`)
  return lines.join('\n')
}

// Compact blueprint — only what the Planner needs, not the full research dump
function renderBlueprint(bp) {
  const lines = [`## PROJECT BLUEPRINT`, bp.idea?.one_liner || '', '']
  if (bp.idea?.mvp_scope) lines.push(`**MVP scope**: ${bp.idea.mvp_scope}`, '')
  const stack = []
  if (bp.stack?.language?.choice)  stack.push(`language: ${bp.stack.language.choice}`)
  if (bp.stack?.framework?.choice) stack.push(`framework: ${bp.stack.framework.choice}`)
  if (bp.stack?.database?.choice)  stack.push(`database: ${bp.stack.database.choice}`)
  if (bp.stack?.infrastructure?.choice) stack.push(`infra: ${bp.stack.infrastructure.choice}`)
  if (stack.length) lines.push(`**Stack**: ${stack.join(', ')}`, '')
  if (bp.stack?.key_libraries?.length) {
    lines.push(`**Key libraries**: ${bp.stack.key_libraries.map(l => l.name).join(', ')}`, '')
  }
  // Only Phase 0 matters for the first task — later phases are future work
  const phase0 = bp.roadmap?.[0]
  if (phase0) {
    lines.push(`**${phase0.phase}**`)
    phase0.deliverables.forEach(d => lines.push(`- ${d}`))
    lines.push('')
  }
  if (bp.risks?.length) lines.push(`**Risks**: ${bp.risks.join('; ')}`, '')
  return lines.join('\n')
}

function renderExplore(ex) {
  if (!ex) return ''
  const lines = ['## CODEBASE EXPLORATION', ex.summary, '']
  const primary = ex.relevant_files?.filter(f => f.role === 'primary') || []
  const other = ex.relevant_files?.filter(f => f.role !== 'primary') || []
  if (primary.length) {
    lines.push('### Files to change')
    primary.forEach(f => lines.push(`- \`${f.path}\` — ${f.why}`))
  }
  if (other.length) {
    lines.push('', '### Related')
    other.forEach(f => lines.push(`- \`${f.path}\` (${f.role}) — ${f.why}`))
  }
  if (ex.call_sites?.length) {
    lines.push('', '### Call sites')
    ex.call_sites.forEach(c => lines.push(`- \`${c.path}\`: ${c.what}`))
  }
  if (ex.existing_tests?.length) lines.push('', `### Existing tests\n${ex.existing_tests.map(t => `- \`${t}\``).join('\n')}`)
  if (ex.tricky_spots?.length) {
    lines.push('', '### Tricky spots')
    ex.tricky_spots.forEach(t => lines.push(`- \`${t.path}\`: ${t.concern}`))
  }
  return lines.join('\n') + '\n\n'
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
  if (r.gaps?.length) lines.push('', `### Unanswered\n${r.gaps.map(g => `- ${g}`).join('\n')}`)
  return lines.join('\n') + '\n\n'
}

function renderSecurity(sec) {
  if (!sec || sec.status !== 'findings' || !sec.findings?.length) return ''
  const lines = ['## SECURITY THREAT MODEL (mitigations are hard requirements)']
  sec.findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${f.severity}] ${f.category}: ${f.what}`)
    lines.push(`   Mitigation: ${f.mitigation}`)
  })
  return lines.join('\n') + '\n\n'
}

// ═══════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════

const DEFAULT_MODELS = {
  trivial: { scout: 'haiku',  explorer: 'haiku',  planner: 'haiku',  coder: 'haiku',  reviewer: 'haiku',  researcher: 'fable', security: 'fable', setup: 'haiku',  verifier: 'haiku',  docs: 'haiku',  bootstrapper: 'sonnet' },
  medium:  { scout: 'sonnet', explorer: 'sonnet', planner: 'sonnet', coder: 'sonnet', reviewer: 'sonnet', researcher: 'fable', security: 'fable', setup: 'sonnet', verifier: 'sonnet', docs: 'haiku',  bootstrapper: 'fable' },
  complex: { scout: 'fable',  explorer: 'fable',  planner: 'fable',  coder: 'fable',  reviewer: 'fable',  researcher: 'fable', security: 'fable', setup: 'fable',  verifier: 'fable',  docs: 'haiku',  bootstrapper: 'fable' },
}

function routeModels(complexity, config) {
  const table = config?.models ? { ...DEFAULT_MODELS, ...config.models } : DEFAULT_MODELS
  return table[complexity] || table.medium
}

// Retry wrapper for phases where a transient failure would abort the whole run
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
const REVIEWER_DIFFERENT_MODEL = CONFIG.reviewerDifferentModel || false
const BLOCKING_SEVERITIES = CONFIG.blockingSeverities || ['critical', 'major']
const MODE = args?.mode || 'brownfield'
const SKIP_SETUP = args?.skipSetup || false
const DO_EXPLORE  = args?.explore  ?? CONFIG.exploreByDefault  ?? false
const DO_RESEARCH = args?.research ?? CONFIG.researchByDefault ?? false
const DO_SECURITY = args?.security ?? CONFIG.securityByDefault ?? false
const DO_VERIFY   = args?.verify   ?? CONFIG.verifyByDefault   ?? false
const DOCS_BUDGET_FLOOR = CONFIG.docsBudgetFloor || 30000

// Phases before Plan run before complexity is known — resolve their models up front
const prePlanModels = routeModels(MODE === 'greenfield' ? 'complex' : 'medium', CONFIG)

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

let task = args?.task || (typeof args === 'string' ? args : null)

if (!task) {
  log('ERROR: No task provided. Workflow({name:"ldo", args:{task:"..."}})')
  return { error: 'No task provided' }
}

log(`Mode: ${MODE}  |  Budget: ${budget.total ? Math.round(budget.remaining() / 1000) + 'k' : 'unlimited'}`)
log(`Task: ${task.slice(0, 200)}${task.length > 200 ? '...' : ''}`)

// ── PHASE 0: BOOTSTRAP ──────────────────────

let blueprint = null

if (MODE === 'greenfield') {
  phase('Bootstrap')

  blueprint = await agentWithRetry(
    `Turn this idea into a concrete, researched project blueprint.\n\n## IDEA\n${task}`,
    { label: 'bootstrapper', phase: 'Bootstrap', model: prePlanModels.bootstrapper, agentType: 'bootstrapper', schema: BOOTSTRAP_SCHEMA }
  )

  if (!blueprint) {
    log('ERROR: Bootstrapper failed.')
    return { error: 'Bootstrapper failed' }
  }

  log(`Blueprint: ${blueprint.idea?.one_liner || '?'}`)
  log(`Stack: ${blueprint.stack?.language?.choice || '?'} + ${blueprint.stack?.framework?.choice || '?'}`)
  log(`Next: ${blueprint.next_action || '?'}`)

  task = `${renderBlueprint(blueprint)}## FIRST TASK\n${blueprint.next_action || 'Scaffold Phase 0: repo, CI, basic structure.'}`
}

// ── PHASE 1: SCOUT ──────────────────────────

phase('Scout')

const codebaseContext = await agentWithRetry(
  'Scan this repository and produce the deterministic snapshot.',
  { label: 'scout', phase: 'Scout', model: prePlanModels.scout, agentType: 'ctx-scout', schema: CTX_SCOUT_SCHEMA }
)

if (!codebaseContext) {
  log('ERROR: CtxScout failed.')
  return { error: 'CtxScout failed to scan codebase' }
}

const CTX = renderContext(codebaseContext)
const CTX_RUNTIME = renderRuntimeContext(codebaseContext)

log(`Scout: ${codebaseContext.key_files?.length || 0} key files  |  Stack: ${codebaseContext.stack?.split('\n')[0] || '?'}`)

// ── PHASE 1.5: EXPLORE (opt-in) ─────────────

let exploreFindings = null

if (DO_EXPLORE) {
  phase('Explore')

  exploreFindings = await agent(
    `Find every file, call site, and pattern relevant to this task.\n\n## TASK\n${task}`,
    { label: 'explorer', phase: 'Explore', model: prePlanModels.explorer, agentType: 'explorer', schema: EXPLORE_SCHEMA }
  )

  if (exploreFindings) {
    const primary = exploreFindings.relevant_files?.filter(f => f.role === 'primary').length || 0
    log(`Explore: ${exploreFindings.relevant_files?.length || 0} files (${primary} primary), ${exploreFindings.call_sites?.length || 0} call sites`)
  } else {
    log('⚠ Explore returned nothing — proceeding without it.')
  }
}

// ── PHASE 1.6: RESEARCH (opt-in) ────────────

let researchReport = null

if (DO_RESEARCH) {
  phase('Research')

  researchReport = await agent(
    `Deep-research this topic. Cross-verify claims across independent sources.\n\n## TOPIC\n${task}`,
    { label: 'researcher', phase: 'Research', model: prePlanModels.researcher, agentType: 'researcher', schema: RESEARCH_SCHEMA }
  )

  if (researchReport) {
    const high = researchReport.findings?.filter(f => f.confidence === 'high').length || 0
    log(`Research: ${researchReport.findings?.length || 0} findings (${high} high-confidence), ${researchReport.recommendations?.length || 0} recommendations`)
  } else {
    log('⚠ Research returned nothing — proceeding without it.')
  }
}

// ── PHASE 2: PLAN ───────────────────────────

phase('Plan')

// CTX first (stable cache prefix), then task-specific findings
const PLAN_CONTEXT = CTX + renderExplore(exploreFindings) + renderResearch(researchReport)

const plan = await agentWithRetry(
  PLAN_CONTEXT + `Analyze this task using the context above. Do NOT re-scan the repo.\n\n## TASK\n${task}`,
  { label: 'planner', phase: 'Plan', model: prePlanModels.planner, agentType: 'planner', schema: PLAN_SCHEMA }
)

if (!plan) {
  log('ERROR: Planner failed.')
  return { error: 'Planner failed' }
}

const models = routeModels(plan.complexity, CONFIG)

// Fresh-eyes reviewer: swap to the complex-tier reviewer model when it would
// otherwise match the coder. Costs one cold cache start, buys an independent read.
if (REVIEWER_DIFFERENT_MODEL && models.reviewer === models.coder) {
  models.reviewer = routeModels('complex', CONFIG).reviewer
}

log(`Complexity: ${plan.complexity}  |  Coder:${models.coder}  Reviewer:${models.reviewer}  Setup:${models.setup}  Docs:${models.docs}`)
log(`Plan: ${plan.steps.length} step(s)`)
plan.steps.forEach(s => log(`  • ${s.what}`))

// ── PHASE 3: SECURITY (opt-in, pre-code) ────

let securityReport = null

if (DO_SECURITY) {
  phase('Security')

  securityReport = await agent(
    CTX + `Threat-model this implementation plan. No code exists yet — identify risks before they are written.\n\n${renderPlan(plan)}`,
    { label: 'security', phase: 'Security', model: models.security, agentType: 'security', schema: SECURITY_SCHEMA }
  )

  if (securityReport) {
    log(`Security: ${securityReport.status} — ${securityReport.summary}`)
    securityReport.findings?.forEach(f => log(`  [${f.severity}] ${f.category}: ${f.what}`))
  } else {
    log('⚠ Security returned nothing — proceeding without threat model.')
  }
}

const SECURITY_BLOCK = renderSecurity(securityReport)

// ── PHASE 4-5: CODE ⇄ REVIEW ────────────────

let iteration = 0
let reviewIssues = []
let finalVerdict = null
let allIssues = []

while (iteration < MAX_FIX_LOOPS) {
  const isFirstPass = iteration === 0

  phase('Code')

  const coderPrompt = isFirstPass
    ? CTX + SECURITY_BLOCK + `Execute this plan. The PROJECT CONTEXT above is a cached snapshot — do not re-read the codebase unless a path turns out wrong.\n\n${renderPlan(plan)}`
    : `Fix the review issues below. Narrow pass — touch only these files.\n\n## ISSUES\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}\n   → ${iss.suggestion}`).join('\n\n')}\n\n## PLAN (context)\n${renderPlanCompact(plan)}`

  const coderResult = await agent(coderPrompt, {
    label: isFirstPass ? 'coder' : `coder-fix-${iteration}`,
    phase: 'Code',
    model: models.coder,
    agentType: 'coder',
    schema: CODER_SUMMARY_SCHEMA,
  })

  log(`Coder pass ${iteration + 1} complete`)

  phase('Review')

  const reviewerPrompt = isFirstPass
    ? CTX + SECURITY_BLOCK + `Review this implementation against the plan.\n\n${renderPlan(plan)}\n\n## CODER'S SUMMARY\n${renderCoderSummary(coderResult)}`
    : `Verify these fixes landed, and scan for new problems introduced by them.\n\n## ISSUES TO VERIFY\n${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}\n\n## CODER'S FIX SUMMARY\n${renderCoderSummary(coderResult)}`

  const verdict = await agent(reviewerPrompt, {
    label: isFirstPass ? 'reviewer' : `reviewer-${iteration}`,
    phase: 'Review',
    model: models.reviewer,
    agentType: 'reviewer',
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) {
    log('ERROR: Reviewer failed.')
    return { error: 'Reviewer failed', plan }
  }

  const issues = verdict.issues || []
  allIssues = issues

  if (verdict.status === 'approved') {
    finalVerdict = verdict
    log(`✓ APPROVED — ${verdict.summary}`)
    break
  }

  // Only critical/major block the loop — minor/nit ride along in the final report
  const blocking = issues.filter(i => BLOCKING_SEVERITIES.includes(i.severity))
  const advisory = issues.filter(i => !BLOCKING_SEVERITIES.includes(i.severity))

  log(`✗ ${issues.length} issue(s): ${blocking.length} blocking, ${advisory.length} advisory`)
  issues.forEach(iss => log(`  [${iss.severity}] ${iss.file}: ${iss.what}`))

  if (blocking.length === 0) {
    finalVerdict = { ...verdict, status: 'approved', summary: `${verdict.summary} (${advisory.length} advisory issue(s) left unfixed)` }
    log(`✓ APPROVED — no blocking issues remain`)
    break
  }

  reviewIssues = blocking
  iteration++
}

if (!finalVerdict) {
  log(`⚠ Max fix loops (${MAX_FIX_LOOPS}) exhausted.`)
  finalVerdict = { status: 'changes_requested', summary: `Max ${MAX_FIX_LOOPS} fix iterations reached.`, issues: allIssues }
}

const approved = finalVerdict.status === 'approved'

// ── PHASE 6: SETUP ──────────────────────────

let envReport = null

if (!SKIP_SETUP) {
  phase('Setup')

  if (!approved) log('⚠ Review not approved — setting up env anyway (non-blocking)')

  envReport = await agent(
    CTX_RUNTIME + 'Get this project into a runnable state. Environment only — no tests, no code review.',
    { label: 'setup', phase: 'Setup', model: models.setup, agentType: 'setup', schema: ENV_SETUP_SCHEMA }
  )

  if (envReport) {
    log(`Project: ${envReport.project_type}  |  Runnable: ${envReport.runnable}`)
    if (envReport.dependencies_installed?.length) log(`Deps: ${envReport.dependencies_installed.join(', ')}`)
    if (envReport.services_started?.length) log(`Services: ${envReport.services_started.join(', ')}`)
    if (envReport.unresolved?.length) log(`⚠ Unresolved: ${envReport.unresolved.join(', ')}`)
  } else {
    log('⚠ Setup returned nothing.')
  }
}

// ── PHASE 7: VERIFY (opt-in) ────────────────

let verifyReport = null

if (DO_VERIFY && approved) {
  phase('Verify')

  const criteria = plan.steps.map((s, i) => `${i + 1}. ${s.acceptance}`).join('\n')
  const startCmd = envReport?.start_command ? `\n\n## START COMMAND\n${envReport.start_command}` : ''

  verifyReport = await agent(
    CTX_RUNTIME + `Drive the application and prove each acceptance criterion holds. Evidence is mandatory.\n\n## ACCEPTANCE CRITERIA\n${criteria}${startCmd}`,
    { label: 'verifier', phase: 'Verify', model: models.verifier, agentType: 'verifier', schema: VERIFY_SCHEMA }
  )

  if (verifyReport) {
    const passed = verifyReport.criteria?.filter(c => c.status === 'passed').length || 0
    const total = verifyReport.criteria?.length || 0
    log(`Verify: ${verifyReport.verdict} — ${passed}/${total} criteria proven`)
    verifyReport.criteria?.filter(c => c.status === 'failed').forEach(c => log(`  ✗ ${c.criterion}`))
    if (verifyReport.blockers?.length) log(`⚠ Blockers: ${verifyReport.blockers.join(', ')}`)
  } else {
    log('⚠ Verify returned nothing.')
  }
} else if (DO_VERIFY) {
  log('Skipping Verify — review not approved.')
}

// ── PHASE 8: DOCS ───────────────────────────

let docsReport = null
const userFacingSteps = plan.steps.filter(s => s.user_facing !== false)
const budgetOk = !budget.total || budget.remaining() > DOCS_BUDGET_FLOOR

if (approved && userFacingSteps.length > 0) {
  if (!budgetOk) {
    log(`⚠ Skipping Docs — ${Math.round(budget.remaining() / 1000)}k tokens left (floor: ${DOCS_BUDGET_FLOOR / 1000}k). Run /docs manually.`)
  } else {
    phase('Docs')

    docsReport = await agent(
      CTX + `Document these user-facing changes.\n\n## CHANGES\n${userFacingSteps.map((s, i) => `${i + 1}. ${s.what}`).join('\n')}\n\n## IMPLEMENTATION SUMMARY\n${finalVerdict.summary}`,
      { label: 'docs', phase: 'Docs', model: models.docs, agentType: 'docs', schema: DOCS_SCHEMA }
    )

    if (docsReport) {
      log(`Docs: ${docsReport.files_changed?.join(', ') || '(none)'}`)
      docsReport.sections_updated?.forEach(s => log(`  • ${s.file}: ${s.section}`))
    } else {
      log('Docs returned nothing.')
    }
  }
} else if (!approved) {
  log('Skipping Docs — review not approved.')
} else {
  log('Skipping Docs — no user-facing changes.')
}

// ── RESULT ──────────────────────────────────

return {
  task: MODE === 'greenfield' ? { original_idea: args?.task, blueprint } : task,
  plan,
  verdict: finalVerdict,
  exploreFindings,
  researchReport,
  securityReport,
  envReport,
  verifyReport,
  docsReport,
  stats: {
    complexity: plan.complexity,
    models,
    coder_passes: iteration + 1,
    approved,
    explored: !!exploreFindings,
    researched: !!researchReport,
    securityStatus: securityReport?.status || 'not_run',
    envReady: envReport?.runnable || false,
    verifyVerdict: verifyReport?.verdict || 'not_run',
    docsWritten: !!docsReport?.files_changed?.length,
    context_files_mapped: codebaseContext?.key_files?.length || 0,
  },
}
