#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

// ── Args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const isGlobal = args.includes('--global') || args.includes('-g')
const isForce = args.includes('--force') || args.includes('-f')
const showHelp = args.includes('--help') || args.includes('-h')

const targetFlag = args.findIndex(a => a === '--target' || a === '-t')
const customTarget = targetFlag > -1 ? args[targetFlag + 1] : null

if (showHelp) {
  console.log(`
ldo-install — Lightweight Dev Orchestrator installer

Usage:
  npx ldo-ai                  install into current project (.claude/)
  npx ldo-ai --global, -g     install globally (~/.claude/)
  npx ldo-ai --target <path>  install into a custom directory
  npx ldo-ai -t <path>        same as --target
  npx ldo-ai --force, -f      overwrite existing files
  npx ldo-ai --help, -h       show this help

Global install adds LDO agents, skills, workflows, and config to
~/.claude/ — available in every Claude Code session on this machine.

Project install copies the same files to .claude/ in the current
directory — scoped to this project.

Custom target installs to any directory — useful when Claude Code
config lives in a non-standard location (e.g. /opt/claude/.claude/).

After install, invoke in Claude Code:
  /ldo "your task description"
`)
  process.exit(0)
}

// ── Paths ─────────────────────────────────────────────────────────
// Source is the package's own .claude/ — single source of truth, no duplicated
// templates/ tree to keep in sync.
const sourceRoot = path.resolve(__dirname, '..', '.claude')

// Only these are LDO's own files. Anything else in .claude/ (settings.local.json,
// hooks, other projects' agents) belongs to the developer, not the package.
const INSTALL_MANIFEST = [
  'workflows/ldo.js',
  'ldo-config.json',
  'agents/planner.md',
  'agents/coder.md',
  'agents/reviewer.md',
  'agents/security.md',
  'agents/researcher.md',
  'skills/planner/SKILL.md',
  'skills/coder/SKILL.md',
  'skills/reviewer/SKILL.md',
  'skills/security/SKILL.md',
  'skills/researcher/SKILL.md',
  'skills/bootstrapper/SKILL.md',
  'skills/ldo-config/SKILL.md',
]

const targetRoot = customTarget
  ? path.resolve(customTarget)
  : isGlobal
    ? path.resolve(process.env.HOME || '~', '.claude')
    : path.resolve(process.cwd(), '.claude')

const mode = customTarget ? 'custom' : isGlobal ? 'global' : 'project'

if (!fs.existsSync(sourceRoot)) {
  console.error('✗  Source directory not found:', sourceRoot)
  console.error('   The package appears to be installed incorrectly.')
  process.exit(1)
}

// ── Install ───────────────────────────────────────────────────────
const copied = []
const identical = []
const conflicts = []
const missing = []

const label = path.basename(targetRoot)

for (const rel of INSTALL_MANIFEST) {
  const src = path.join(sourceRoot, rel)
  const dest = path.join(targetRoot, rel)

  if (!fs.existsSync(src)) {
    missing.push(rel)
    continue
  }

  if (fs.existsSync(dest) && !isForce) {
    if (fs.readFileSync(src, 'utf8') === fs.readFileSync(dest, 'utf8')) {
      identical.push(rel)
      continue
    }
    conflicts.push(rel)
    console.log(`  ~  ${label}/${rel}  (differs — use --force to overwrite)`)
    continue
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  copied.push(rel)
  console.log(`  ✓  ${label}/${rel}`)
}

// ── Summary ───────────────────────────────────────────────────────
console.log('')
console.log(`  ╔══════════════════════════════════════╗`)
console.log(`  ║   LDO installer                      ║`)
console.log(`  ╚══════════════════════════════════════╝`)
console.log('')
console.log(`  Target: ${targetRoot}`)
console.log(`  Mode:   ${mode}`)
console.log('')
console.log(`  ${copied.length} copied, ${identical.length} already current, ${conflicts.length} kept`)

if (missing.length) {
  console.log('')
  console.log(`  ⚠  ${missing.length} file(s) missing from the package:`)
  missing.forEach(m => console.log(`     ${m}`))
}

if (conflicts.length && !isForce) {
  console.log('')
  console.log('  ℹ  Files with local changes were kept. To overwrite:')
  console.log('     npx ldo-ai --force')
}

console.log('')
console.log('  Next steps:')
console.log('    1. Edit ldo-config.json to set your model routing')
console.log('    2. Run /ldo-config in Claude Code for a walkthrough')
console.log('    3. Start a task: /ldo "your task description"')
console.log('')

process.exit(missing.length ? 1 : 0)
