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
    'Follow the role instructions below. Work only in the current repository.',
    '',
    '## ROLE INSTRUCTIONS',
    roleInstructions(role),
    '',
    '## TASK',
    task,
  ]
  if (context && Object.keys(context).length) {
    sections.push('', '## PRIOR PHASE RESULTS', JSON.stringify(context, null, 2))
  }
  sections.push('', 'Return only JSON that conforms to the supplied output schema. Do not wrap it in Markdown.')
  return sections.join('\n')
}
