import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(new URL('..', import.meta.url).pathname)

export function roleInstructions(role) {
  const path = join(ROOT, 'agents', `${role}.md`)
  return readFileSync(path, 'utf8')
}

export function buildPrompt({ role, task, context }) {
  const sections = [
    `You are LDO's ${role}.`,
    'You are an LDO subagent. Do not invoke the LDO orchestrator or start another LDO pipeline; complete only this assigned role.',
    'Follow the role instructions below. Work only in the current repository.',
    '',
    '## ROLE INSTRUCTIONS',
    roleInstructions(role),
    '',
    '## TASK',
    task,
  ]
  const { isolation, ...prior } = context || {}
  if (isolation?.path && isolation?.branch) {
    sections.push('', '## ISOLATION', `Your worktree is \`${isolation.path}\` on branch \`${isolation.branch}\`. Work only there; verify it with \`git rev-parse --show-toplevel\` before writing.`)
  }
  if (Object.keys(prior).length) {
    sections.push('', '## PRIOR PHASE RESULTS', JSON.stringify(prior, null, 2))
  }
  sections.push('', 'Return only JSON that conforms to the supplied output schema. Do not wrap it in Markdown.')
  return sections.join('\n')
}
