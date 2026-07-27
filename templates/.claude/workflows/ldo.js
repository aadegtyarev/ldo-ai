export const meta = {
  name: 'ldo',
  description: 'Lightweight Dev Orchestrator: [Bootstrap→][Research→]Scout→Plan→Code⇄Review→[Security→]Setup→Docs',
  phases: [
    { title: 'Bootstrap', detail: 'Greenfield: research, stack, roadmap' },
    { title: 'Scout', detail: 'Read codebase ONCE → deterministic snapshot (cache-stable)' },
    { title: 'Explore', detail: 'Deep codebase search for task-specific patterns (opt-in)' },
    { title: 'Research', detail: 'Deep web research on topic (opt-in)' },
    { title: 'Plan', detail: 'Task + snapshot → plan (no codebase re-read)' },
    { title: 'Code', detail: 'Implement plan, write tests' },
    { title: 'Review', detail: 'Review diff' },
    { title: 'Security', detail: 'Threat analysis: OWASP, injection, auth, data exposure' },
    { title: 'Setup', detail: 'Install deps, configure env' },
    { title: 'Docs', detail: 'Write/update docs' },
  ],
}

// ═══════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════

// Scout output — deterministic codebase snapshot. This is the cache prefix.
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
      description: 'Important files with their purposes',
    },
    entry_points: { type: 'array', items: { type: 'string' }, description: 'Main scripts, config files, build commands' },
    dependencies: { type: 'string', description: 'Key third-party packages already in use (one line)' },
  },
  required: ['structure', 'stack', 'key_files'],
}

// Planner output — no codebase_context (it receives it from Scout)
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    complexity: { type: 'string', enum: ['trivial', 'medium', 'complex'] },
    summary: { type: 'string', description: 'One-paragraph summary' },
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
    files_changed: { type: 'array', items: { type: 'string' }, description: 'Every file modified' },
    summary: { type: 'string', description: 'One paragraph: what was done and why' },
    tests: {
      type: 'object',
      properties: {
        written: { type: 'array', items: { type: 'string' }, description: 'New test files created' },
        updated: { type: 'array', items: { type: 'string' }, description: 'Existing test files modified' },
      },
    },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Where the plan was wrong and what was done instead' },
  },
  required: ['files_changed', 'summary'],
}

const BOOTSTRAP_SCHEMA = {
  type: 'object',
  properties: {
    idea: {
      type: 'object',
      properties: { one_liner: { type: 'string' }, problem: { type: 'string' }, audience: { type: 'string' }, mvp_scope: { type: 'string' } },
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
    question: { type: 'string', description: 'The original research question' },
    summary: { type: 'string', description: '3-5 sentence executive summary' },
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
      items: {
        type: 'object',
        properties: { url: { type: 'string' }, title: { type: 'string' }, relevance: { type: 'string' } },
        required: ['url', 'title'],
      },
    },
  },
  required: ['question', 'summary', 'findings'],
}

const SECURITY_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['clean', 'findings'] },
    summary: { type: 'string', description: 'One-paragraph security posture assessment' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category: { type: 'string', enum: ['injection', 'auth', 'data_exposure', 'input_validation', 'ssrf', 'supply_chain', 'crypto', 'race_condition', 'resource', 'config'] },
          file: { type: 'string' },
          line_hint: { type: 'string' },
          what: { type: 'string' },
          exploit_scenario: { type: 'string' },
          fix: { type: 'string' },
          cwe: { type: 'string' },
        },
        required: ['severity', 'category', 'file', 'what', 'exploit_scenario', 'fix'],
      },
    },
    threat_model_notes: { type: 'string' },
  },
  required: ['status', 'summary'],
}

// ═══════════════════════════════════════════
// CONTEXT CACHE — the core optimization
// ═══════════════════════════════════════════

// Build the shared text prefix from CtxScout's deterministic snapshot.
//
// ⚠ CACHE STRATEGY (critical):
// Anthropic prompt cache is keyed on (model_id + prefix_bytes).
// → Same model + same CTX prefix = cache HIT (≈10× cheaper input).
// → Different model + same CTX prefix = cache MISS.
//
// The CTX prefix is produced by CtxScout (a separate agent, Phase 1a).
// On workflow resume: if the codebase hasn't changed, CtxScout is SKIPPED
// (resumeFromRunId) → CTX bytes are IDENTICAL → ALL downstream agents
// using the same model get cache hits, even across workflow restarts.
//
// Cache profile (same model chain):
//   Coder(model_A)    = COLD → populates model_A cache
//   Reviewer(model_A) = HOT  ✓
//   Setup(model_A)    = HOT  ✓
//   Docs(model_B)     = COLD → different model, separate cache namespace

function renderContext(ctx) {
  if (!ctx) return ''
  const parts = ['## PROJECT CONTEXT']

  if (ctx.structure) {
    parts.push('### Structure\n' + ctx.structure)
  }
  if (ctx.stack) {
    parts.push('### Stack\n' + ctx.stack)
  }
  if (ctx.conventions) {
    parts.push('### Conventions\n' + ctx.conventions)
  }
  if (ctx.key_files && ctx.key_files.length > 0) {
    parts.push('### Key Files\n' + ctx.key_files.map(f => `- \`${f.path}\` — ${f.purpose}`).join('\n'))
  }
  if (ctx.dependencies) {
    parts.push('### Dependencies\n' + ctx.dependencies)
  }
  if (ctx.entry_points && ctx.entry_points.length > 0) {
    parts.push('### Entry Points\n' + ctx.entry_points.map(e => `- \`${e}\``).join('\n'))
  }

  return parts.join('\n') + '\n\n'
}

// Minimal context for Setup — only structure + stack (rest is irrelevant)
function renderSetupContext(ctx) {
  if (!ctx) return ''
  const parts = []
  if (ctx.structure) parts.push('### Structure\n' + ctx.structure)
  if (ctx.stack) parts.push('### Stack\n' + ctx.stack)
  if (ctx.entry_points) parts.push('### Entry Points\n' + ctx.entry_points.map(e => `- \`${e}\``).join('\n'))
  return parts.length > 0 ? '## PROJECT CONTEXT\n' + parts.join('\n') + '\n\n' : ''
}

// Compact plan — text, not JSON. ~40% fewer tokens.
function renderPlan(plan) {
  const lines = [`## PLAN (${plan.complexity})`, plan.summary, '', '### Steps']
  for (const s of plan.steps) {
    lines.push(`${plan.steps.indexOf(s) + 1}. ${s.what}`)
    lines.push(`   Files: ${s.files.join(', ')}`)
    lines.push(`   Accept: ${s.acceptance}`)
  }
  if (plan.risks && plan.risks.length > 0) {
    lines.push('', '### Risks')
    for (const r of plan.risks) lines.push(`- ${r}`)
  }
  return lines.join('\n')
}

// Ultra-compact: just the step names + files for the fix loop
function renderPlanCompact(plan) {
  return plan.steps.map((s, i) => `${i + 1}. ${s.what} [${s.files.join(', ')}]`).join('\n')
}

// Format coder summary (object from schema) for Reviewer consumption
function renderCoderSummary(result) {
  if (!result) return '(No summary)'
  if (typeof result === 'string') return result
  const lines = [`**Files changed**: ${result.files_changed?.join(', ') || '(none)'}`]
  if (result.summary) lines.push(`**Summary**: ${result.summary}`)
  if (result.tests) {
    if (result.tests.written?.length) lines.push(`**Tests written**: ${result.tests.written.join(', ')}`)
    if (result.tests.updated?.length) lines.push(`**Tests updated**: ${result.tests.updated.join(', ')}`)
  }
  if (result.deviations?.length) lines.push(`**Deviations from plan**: ${result.deviations.join('; ')}`)
  return lines.join('\n')
}

// ═══════════════════════════════════════════
// MODEL ROUTING
// ═══════════════════════════════════════════

// Scout uses a model capable of understanding codebase structure —
// it produces a deterministic structured output (schema-constrained).
// On resume, Scout is usually SKIPPED (resumeFromRunId) so this model
// only matters on the first run.

const DEFAULT_MODELS = {
  trivial:  { scout: 'haiku',  planner: 'haiku',  coder: 'haiku',  reviewer: 'haiku',  researcher: 'fable', security: 'fable', setup: 'haiku',  docs: 'haiku',  bootstrapper: 'sonnet' },
  medium:   { scout: 'sonnet', planner: 'sonnet', coder: 'sonnet', reviewer: 'sonnet', researcher: 'fable', security: 'fable', setup: 'sonnet', docs: 'haiku',  bootstrapper: 'fable' },
  complex:  { scout: 'fable',  planner: 'fable',  coder: 'fable',  reviewer: 'fable',  researcher: 'fable', security: 'fable', setup: 'fable',  docs: 'haiku',  bootstrapper: 'fable' },
}

function routeModels(complexity, config) {
  const table = (config && config.models) ? { ...DEFAULT_MODELS, ...config.models } : DEFAULT_MODELS
  return table[complexity] || table.medium
}

// When reviewer uses a different model than coder:
// - Coder populates cache for coder_model → Reviewer(COLD), Setup(HOT on coder_model)
// - Net: 1 extra cold start per run. Worth it for complex tasks (adversarial benefit).
// - When reviewer uses same model: cache stays hot through the entire pipeline.

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const CONFIG = (args && args.config) || {}
const MAX_FIX_LOOPS = CONFIG.maxFixLoops || 3
const REVIEWER_DIFFERENT_MODEL = CONFIG.reviewerDifferentModel || false
const MODE = (args && args.mode) || 'brownfield'
const SKIP_SETUP = (args && args.skipSetup) || false
const SKIP_RESEARCH = (args && args.skipResearch) || false
const SKIP_SECURITY = (args && args.skipSecurity) || false
const DO_RESEARCH = (args && args.research) || CONFIG.researchByDefault || false
const DO_SECURITY = (args && args.security) || CONFIG.securityByDefault || false
const DO_EXPLORE = (args && args.explore) || CONFIG.exploreByDefault || false
const DOCS_BUDGET_FLOOR = CONFIG.docsBudgetFloor || 30000

// Pre-resolve models for phases before complexity is known.
// Bootstrapper (greenfield) = always complex tier (research + stack is a hard problem).
// Scout = medium tier by default (conservative; configurable per tier).
const prePlanModels = routeModels(MODE === 'greenfield' ? 'complex' : 'medium', CONFIG)

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

let task = (args && args.task) ? args.task : (typeof args === 'string' ? args : null)

if (!task) {
  log('ERROR: No task provided. Workflow({name:"ldo", args:{task:"..."}})')
  return { error: 'No task provided' }
}

log(`Mode: ${MODE}  |  Budget: ${budget.total ? Math.round(budget.remaining()/1000) + 'k' : 'unlimited'}`)
log(`Task: ${task.slice(0, 200)}${task.length > 200 ? '...' : ''}`)

// ═══════════════════════════════════════════
// PHASE 0: BOOTSTRAP
// ═══════════════════════════════════════════

let blueprint = null

if (MODE === 'greenfield') {
  phase('Bootstrap')

  blueprint = await agent(
    `You are a **Bootstrapper**. Turn this idea into a concrete, researched project blueprint.

## IDEA
${task}

## PROCESS
1. Clarify vague parts (proceed with reasonable defaults if unclear)
2. Search the web for similar open-source projects and commercial products (3-5 each)
3. Pick a stack: language, framework, database, infrastructure — with rationale and alternatives
4. Draft a phased roadmap: Phase 0 (scaffold), Phase 1 (core MVP), Phase 2 (essentials), Phase 3 (polish)

Return structured output with: idea, research, stack, roadmap, risks, next_action.
Keep research to key findings. Stack choices should favor simplicity. Phase 0 must fit in one session.`,

    { label: 'bootstrapper', phase: 'Bootstrap', model: prePlanModels.bootstrapper, schema: BOOTSTRAP_SCHEMA }
  )

  if (!blueprint) {
    log('ERROR: Bootstrapper failed.')
    return { error: 'Bootstrapper failed' }
  }

  log(`Blueprint: ${blueprint.idea?.one_liner || '?'}`)
  log(`Stack: ${blueprint.stack?.language?.choice || '?'} + ${blueprint.stack?.framework?.choice || '?'}`)
  log(`Next: ${blueprint.next_action || '?'}`)

  task = `## PROJECT BLUEPRINT
${JSON.stringify(blueprint, null, 2)}

## FIRST TASK
${blueprint.next_action || 'Scaffold Phase 0: repo, CI, basic structure.'}`
}

// ═══════════════════════════════════════════
// PHASE 1a: SCOUT (deterministic codebase snapshot)
// ═══════════════════════════════════════════

phase('Scout')

const codebaseContext = await agent(
  `You are a **CtxScout** — the codebase reader. Scan this repository and produce a deterministic snapshot. This snapshot is the ONLY codebase information that downstream agents will see — they do NOT re-read the repo.

## PROCESS
1. List the top-level directory structure and key subdirectories
2. Identify the tech stack from config files (package.json, pyproject.toml, go.mod, Makefile, etc.)
3. Sample a few source files to understand coding conventions
4. List key files with their purposes

## RULES
- File paths must be REAL — verify by listing/reading
- Don't read every file — sample enough to understand conventions
- The snapshot must fit in ~500-1000 tokens. Be dense, not verbose.
- Keep descriptions formulaic and stable — this output becomes a cache prefix.
- If the repo is empty/new, note that and don't fabricate structure.`,

  { label: 'scout', phase: 'Scout', model: prePlanModels.scout, schema: CTX_SCOUT_SCHEMA }
)

if (!codebaseContext) {
  log('ERROR: CtxScout failed.')
  return { error: 'CtxScout failed to scan codebase' }
}

// Build the shared cache prefix from the deterministic snapshot.
// On workflow resume: if scout call unchanged → skipped by resumeFromRunId
// → codebaseContext identical → CTX bytes identical → all downstream cache hits.
const CTX = renderContext(codebaseContext)
const CTX_SETUP = renderSetupContext(codebaseContext)

log(`Scout: ${codebaseContext.key_files?.length || 0} key files  |  Stack: ${codebaseContext.stack?.split('\n')[0] || '?'}`)

// ═══════════════════════════════════════════
// PHASE 1.5: EXPLORE (opt-in, task-specific codebase scan)
// ═══════════════════════════════════════════

let exploreFindings = null

if (DO_EXPLORE) {
  phase('Explore')

  // Explorer uses the built-in Explore agent type — fan-out search across
  // the codebase for task-specific patterns, usages, and affected files.
  exploreFindings = await agent(
    `Search the codebase for everything relevant to this task:

## TASK
${task}

## WHAT TO FIND
1. All files that match patterns related to this task (function calls, imports, config keys, data types)
2. Where the relevant logic currently lives — trace through the codebase
3. All call sites / consumers / dependents of the affected code
4. Any existing tests related to these files
5. Edge cases or tricky spots (complex conditionals, error handlers, platform-specific code)

Be thorough. The Planner will rely on your findings for accurate file lists.`,

    { label: 'explorer', phase: 'Explore', agentType: 'Explore' }
  )

  if (exploreFindings) {
    log(`Explore: completed — results fed to Planner`)
    // Prepend explore findings to the task context for Planner
    task = `## CODEBASE EXPLORATION
${exploreFindings.slice(0, 3000)}${exploreFindings.length > 3000 ? '\n...(truncated, full scan was deeper)' : ''}

## TASK
${task}`
  } else {
    log('⚠ Explore returned nothing — proceeding without it.')
  }
}

// ═══════════════════════════════════════════
// PHASE 1.6: RESEARCH (opt-in, pre-plan web search)
// ═══════════════════════════════════════════

let researchReport = null

if (DO_RESEARCH && !SKIP_RESEARCH) {
  phase('Research')

  researchReport = await agent(
    `You are a **Researcher**. Deep-research the topic below. Use WebSearch with multiple angles, cross-verify claims, synthesise findings.

## TOPIC
${task}

## SUB-QUESTIONS
Break this into 2-4 sub-questions. For each: search multiple sources, fetch the most relevant, cross-verify claims.

## OUTPUT
- findings with confidence levels (high/medium/low) and sources
- actionable recommendations
- knowledge gaps (what couldn't be answered)

Prefer primary sources over secondary. Cross-verify every material claim.`,

    { label: 'researcher', phase: 'Research', model: prePlanModels.researcher, schema: RESEARCH_SCHEMA }
  )

  if (researchReport) {
    log(`Research: ${researchReport.findings?.length || 0} findings, confidence: ${researchReport.findings?.filter(f => f.confidence === 'high').length || 0} high`)
    if (researchReport.recommendations?.length) log(`Recs: ${researchReport.recommendations.length}`)

    // Feed research into the Planner's task context
    task = `## RESEARCH FINDINGS
${researchReport.summary}

Key findings:
${(researchReport.findings || []).map(f => `- [${f.confidence}] ${f.claim}`).join('\n')}

Recommendations:
${(researchReport.recommendations || []).map(r => `- ${r}`).join('\n')}

## TASK
${task}`
  } else {
    log('⚠ Research returned nothing — proceeding without it.')
  }
}

// ═══════════════════════════════════════════
// PHASE 1b: PLAN (CTX + task → plan)
// ═══════════════════════════════════════════

phase('Plan')

const plan = await agent(
  CTX + `You are a **Planner**. Analyze the task using the PROJECT CONTEXT above (do NOT re-scan the repo).

## TASK
${task}

## INSTRUCTIONS

### Complexity
- trivial: typo, config, one-liner
- medium: feature, refactor, multi-file change
- complex: architecture, migration, new subsystem

### Plan Steps
Each step: what to do, which files (use paths from PROJECT CONTEXT), how to verify (specific!), whether it's user-facing.

### Important
Trust the PROJECT CONTEXT. If a path looks wrong, flag it in risks — don't silently propagate errors.`,

  { label: 'planner', phase: 'Plan', model: prePlanModels.planner, schema: PLAN_SCHEMA }
)

if (!plan) {
  log('ERROR: Planner failed.')
  return { error: 'Planner failed' }
}

// ── Routing & Cache ──

const models = routeModels(plan.complexity, CONFIG)

// REVIEWER_DIFFERENT_MODEL: if reviewer and coder share the same model name,
// bump reviewer to models[complex].reviewer for a fresh adversarial perspective.
// No tier guard — model names are user-routed through a proxy (haiku may map to opus).
// Setup and Docs keep their original models — preserving the cache chain:
//   Coder(model_x) populates → Setup(model_x) hits.
// Only Reviewer incurs a cold start. Net cost: +1 cold per run.
if (REVIEWER_DIFFERENT_MODEL && models.reviewer === models.coder) {
  const complexModels = routeModels('complex', CONFIG)
  models.reviewer = complexModels.reviewer
}

log(`Complexity: ${plan.complexity}  |  Coder:${models.coder}  Reviewer:${models.reviewer}  Setup:${models.setup}  Docs:${models.docs}`)
log(`Plan: ${plan.steps.length} step(s)`)
for (const s of plan.steps) log(`  • ${s.what}`)

// ═══════════════════════════════════════════
// PHASE 2-3: CODE + REVIEW LOOP
// ═══════════════════════════════════════════

let iteration = 0
let reviewIssues = []
let finalVerdict = null

while (iteration < MAX_FIX_LOOPS) {
  const isFirstPass = iteration === 0

  // ── CODE ──

  phase('Code')

  const coderPrompt = isFirstPass
    ? CTX + `You are a **Coder**. Execute the plan. The PROJECT CONTEXT above is a cached snapshot — do NOT re-read the codebase unless a file path turns out wrong.

${renderPlan(plan)}

## RULES
1. Work through steps in order. Read files before editing them.
2. Write/update tests for every behavior change (happy path + edge cases + error handling).
3. After ALL steps, run the tests. Then \`git diff\` to review holistically.
4. Follow the conventions listed in PROJECT CONTEXT.
5. Return a summary of everything changed, file by file, including tests.
6. Adapt if the plan's file paths are wrong — note deviations.`
    : `You are a **Coder**. Fix the issues found during review. This is a narrow fix pass — only the files below need changes.

## ISSUES TO FIX
${reviewIssues.map((iss, i) => `${i + 1}. **[${iss.severity}] ${iss.file}**: ${iss.what}
   → ${iss.suggestion}`).join('\n\n')}

## ORIGINAL PLAN (for context)
${renderPlanCompact(plan)}

## RULES
1. Read the affected files, make the fixes, run tests for changed files.
2. Don't re-read the whole codebase — only the files with issues.
3. Return a brief summary: which issues were fixed, how.
4. Don't introduce new changes beyond the listed issues.`

  const coderResult = await agent(coderPrompt, {
    label: isFirstPass ? 'coder' : `coder-fix-${iteration}`,
    phase: 'Code',
    model: models.coder,
    schema: CODER_SUMMARY_SCHEMA,
  })

  log(`Coder pass ${iteration + 1} complete`)

  // ── REVIEW ──

  phase('Review')

  const reviewerPrompt = isFirstPass
    ? CTX + `You are a **Reviewer**. Quality-gate the implementation — both plan compliance AND code quality. The PROJECT CONTEXT above is cached.

${renderPlan(plan)}

## CODER'S SUMMARY
${renderCoderSummary(coderResult)}

## PROCESS
1. Run \`git diff --stat\` to see what changed, then read changed files.
2. **Plan compliance** — every step fulfilled? Acceptance criteria met?
3. **Correctness** — bugs, edge cases, null/undefined, error handling, race conditions, off-by-one?
4. **Simplification** — dead code, over-engineering, unnecessary abstraction, duplicated logic? Could this be done in fewer lines without losing clarity?
5. **Efficiency** — N+1 queries, unnecessary allocations, blocking I/O, repeated work?
6. **Consistency** — matches PROJECT CONTEXT conventions? No regressions in unrelated code?
7. Be specific: exact file, exact problem, actionable fix suggestion.
8. If everything is good, approve.

## SEVERITY
- critical: breaks functionality, crashes, data loss
- major: design flaw, missed requirement, N+1/perf issue
- minor: dead code, style inconsistency, unclear naming
- nit: optional simplification, personal preference`
    : `You are a **Reviewer**. Verify the fixes from this iteration. This is a narrow review — only check that the listed issues were resolved, and briefly scan for new correctness/simplification issues introduced by the fix.

## ISSUES THAT WERE SUPPOSED TO BE FIXED
${reviewIssues.map((iss, i) => `${i + 1}. [${iss.severity}] ${iss.file}: ${iss.what}`).join('\n')}

## CODER'S FIX SUMMARY
${renderCoderSummary(coderResult)}

## PROCESS
1. Run \`git diff\` to see what changed in this fix pass.
2. Read only the changed files. Verify: each issue actually fixed?
3. Quick scan: any NEW correctness bugs or dead code introduced by this fix?
4. Approve if all issues are resolved and no new problems.
5. Don't re-read the whole codebase — focus on the diff.`

  const verdict = await agent(reviewerPrompt, {
    label: isFirstPass ? 'reviewer' : `reviewer-${iteration}`,
    phase: 'Review',
    model: models.reviewer,
    schema: VERDICT_SCHEMA,
  })

  if (!verdict) {
    log('ERROR: Reviewer failed.')
    return { error: 'Reviewer failed', plan }
  }

  if (verdict.status === 'approved') {
    finalVerdict = verdict
    log(`✓ APPROVED — ${verdict.summary}`)
    break
  }

  log(`✗ CHANGES REQUESTED — ${verdict.issues.length} issue(s)`)
  for (const iss of verdict.issues) log(`  [${iss.severity}] ${iss.file}: ${iss.what}`)

  reviewIssues = verdict.issues
  iteration++
}

if (!finalVerdict) {
  log(`⚠ Max fix loops (${MAX_FIX_LOOPS}) exhausted.`)
  finalVerdict = { status: 'changes_requested', summary: `Max ${MAX_FIX_LOOPS} fix iterations reached.`, issues: reviewIssues }
}

// ═══════════════════════════════════════════
// PHASE 3.5: SECURITY (post-review threat audit)
// ═══════════════════════════════════════════

let securityReport = null
const securityBudgetOk = !budget.total || budget.remaining() > 40000

if (DO_SECURITY && !SKIP_SECURITY && approved) {
  if (!securityBudgetOk) {
    log(`⚠ Skipping Security — insufficient token budget. Run /security manually.`)
  } else {
    phase('Security')

    securityReport = await agent(
      CTX + `You are a **Security** — the threat analysis stage. Audit the approved code changes for vulnerabilities. The PROJECT CONTEXT above is cached.

${renderPlan(plan)}

## INSTRUCTIONS

1. Run \`git diff --stat\` to see what changed.
2. Read changed files and check for 10 threat categories:
   - **Injection**: SQL, command, template injection
   - **Auth**: Broken access control, missing auth, token leaks, session issues
   - **Data Exposure**: Secrets in code, PII in logs, unencrypted sensitive data
   - **Input Validation**: Missing validation, XSS, prototype pollution, path traversal
   - **SSRF/URL**: User-controlled URLs, redirect chains
   - **Supply Chain**: New deps, eval(), dynamic imports, deserialisation
   - **Crypto**: Hardcoded keys, weak algorithms, broken RNG
   - **Race Conditions**: TOCTOU, concurrent state access
   - **Resource Exhaustion**: Unbounded allocations, missing rate limits, regex DoS
   - **Config**: Default passwords, debug in prod, missing security headers

3. For each finding: verify it's real (read the file), provide an exploit scenario, suggest a fix.
4. Reference CWE code where applicable.
5. If the diff is security-irrelevant, return \`clean\` quickly.

## SEVERITY
- critical: RCE, auth bypass, data breach, secret leak
- high: Injection without RCE, privilege escalation, SSRF
- medium: XSS, CSRF, missing security headers, info disclosure
- low: Weak config, debug leakage
- info: Best practice, hardening`,

      { label: 'security', phase: 'Security', model: models.security, schema: SECURITY_SCHEMA }
    )

    if (securityReport) {
      log(`Security: ${securityReport.status} — ${securityReport.summary}`)
      if (securityReport.findings?.length) {
        log(`⚠ ${securityReport.findings.length} finding(s):`)
        for (const f of securityReport.findings) log(`  [${f.severity}] ${f.category}: ${f.file} — ${f.what}`)
      }
    } else {
      log('⚠ Security returned nothing.')
    }
  }
} else if (DO_SECURITY && !approved) {
  log('Skipping Security — review not approved.')
}

// ═══════════════════════════════════════════
// PHASE 4: SETUP (lightweight — no full ctx)
// ═══════════════════════════════════════════

const approved = finalVerdict.status === 'approved'
let envReport = null

if (!SKIP_SETUP) {
  phase('Setup')

  if (!approved) {
    log('⚠ Review was not approved — setting up env anyway (env setup is non-blocking)')
  }

  envReport = await agent(
    CTX_SETUP + `You are a **Setup** — environment bootstrapper. Get this project runnable.

## PROCESS
1. Detect the project from the context above (package.json / pyproject.toml / go.mod / etc.)
2. Install dependencies (npm install / pip install / go mod download)
3. Start services if needed (docker-compose up -d, or note if unavailable)
4. Copy .env.example → .env, fill in safe defaults
5. Smoke check: run the build/dev server once, verify it starts, then stop it
6. Report: project_type, what was installed/started/configured, issues found/fixed, unresolved items.

This is ENVIRONMENT ONLY. No tests, no code review, no feature verification.`,

    { label: 'setup', phase: 'Setup', model: models.setup, schema: ENV_SETUP_SCHEMA }
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

// ═══════════════════════════════════════════
// PHASE 5: DOCS (skippable on low budget)
// ═══════════════════════════════════════════

let docsReport = null
const userFacingSteps = plan.steps.filter(s => s.user_facing !== false)
const hasUserFacingChanges = userFacingSteps.length > 0
const budgetOk = !budget.total || budget.remaining() > DOCS_BUDGET_FLOOR

if (approved && hasUserFacingChanges) {
  if (!budgetOk) {
    log(`⚠ Skipping Docs — only ${Math.round(budget.remaining()/1000)}k tokens remain (floor: ${DOCS_BUDGET_FLOOR/1000}k). Run /docs manually.`)
  } else {
    phase('Docs')

    docsReport = await agent(
      CTX + `You are a **Docs** — documentation writer. The PROJECT CONTEXT above is cached.

## CHANGES MADE
${userFacingSteps.map((s, i) => `${i + 1}. ${s.what}`).join('\n')}

## IMPLEMENTATION SUMMARY
${finalVerdict.summary || '(No summary)'}

## PROCESS
1. Survey existing docs: README.md, CHANGELOG.md, docs/, API specs
2. Update README with new usage if applicable
3. Add CHANGELOG entry for user-facing changes
4. Update API docs if endpoints changed
5. Match existing doc conventions and tone
6. If no docs exist, create a minimal README

## RULES
- Only document what was actually built
- User-facing → CHANGELOG line. Internal refactor → skip.
- Don't rewrite the whole README — update only relevant sections.`,

      { label: 'docs', phase: 'Docs', model: models.docs, schema: DOCS_SCHEMA }
    )

    if (docsReport) {
      log(`Docs: ${docsReport.files_changed?.join(', ') || '(none)'}`)
      for (const s of (docsReport.sections_updated || [])) log(`  • ${s.file}: ${s.section}`)
    } else {
      log('Docs returned nothing.')
    }
  }
} else if (!approved) {
  log('Skipping Docs — review not approved.')
} else {
  log('Skipping Docs — no user-facing changes detected.')
}

// ═══════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════

return {
  task: (MODE === 'greenfield' ? { original_idea: (typeof args === 'object' ? args.task : args), blueprint } : task),
  plan: { complexity: plan.complexity, summary: plan.summary, steps: plan.steps, risks: plan.risks },
  verdict: finalVerdict,
  exploreFindings,
  researchReport,
  securityReport,
  envReport,
  docsReport,
  stats: {
    complexity: plan.complexity,
    models,
    coder_passes: iteration + 1,
    approved: finalVerdict.status === 'approved',
    envReady: envReport?.runnable || false,
    explored: !!exploreFindings,
    researched: !!researchReport,
    securityAudited: !!securityReport,
    securityStatus: securityReport?.status || 'not_run',
    docsWritten: !!(docsReport && docsReport.files_changed?.length > 0),
    context_files_mapped: codebaseContext?.key_files?.length || 0,
  },
}
