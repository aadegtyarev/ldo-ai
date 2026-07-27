#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

// ── Args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const isGlobal = args.includes('--global') || args.includes('-g')
const isForce  = args.includes('--force') || args.includes('-f')
const showHelp = args.includes('--help') || args.includes('-h')

// Parse --target <path> or -t <path>
let customTarget = null
const targetIdx = args.indexOf('--target')
const tIdx = args.indexOf('-t')
if (targetIdx > -1 && args[targetIdx + 1]) customTarget = args[targetIdx + 1]
if (tIdx > -1 && args[tIdx + 1]) customTarget = args[tIdx + 1]

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
const templateRoot = path.resolve(__dirname, '..', 'templates', '.claude')
const targetRoot = customTarget
  ? path.resolve(customTarget)
  : isGlobal
    ? path.resolve(process.env.HOME || '~', '.claude')
    : path.resolve(process.cwd(), '.claude')

const mode = customTarget ? 'custom' : isGlobal ? 'global' : 'project'

if (!fs.existsSync(templateRoot)) {
  console.error('✗  Template directory not found:', templateRoot)
  console.error('   Make sure the package was installed correctly.')
  process.exit(1)
}

// ── Install ───────────────────────────────────────────────────────
const copied = []
const skipped = []
const merged = []

function walk(dir, relPath) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const src = path.join(dir, e.name)
    const destRel = path.join(relPath, e.name)
    const dest = path.join(targetRoot, destRel)

    if (e.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true })
      walk(src, destRel)
    } else {
      if (fs.existsSync(dest) && !isForce) {
        const srcContent = fs.readFileSync(src, 'utf8')
        const dstContent = fs.readFileSync(dest, 'utf8')
        if (srcContent === dstContent) {
          skipped.push(destRel)
          continue
        }
        merged.push(destRel)
        console.log(`  ~  ${path.basename(targetRoot)}/${destRel}  (unchanged — exists with different content, use --force to overwrite)`)
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
        copied.push(destRel)
        console.log(`  ✓  ${path.basename(targetRoot)}/${destRel}`)
      }
    }
  }
}

console.log('')
console.log(`  ╔══════════════════════════════════════╗`)
console.log(`  ║   LDO installer                      ║`)
console.log(`  ╚══════════════════════════════════════╝`)
console.log('')
console.log(`  Installing to: ${targetRoot}`)
console.log(`  Mode:          ${mode}`)
console.log('')

fs.mkdirSync(targetRoot, { recursive: true })
walk(templateRoot, '')

// ── Summary ───────────────────────────────────────────────────────
console.log('')
console.log(`  ${copied.length} files copied, ${skipped.length} identical, ${merged.length} unchanged`)

if (merged.length > 0 && !isForce) {
  console.log('')
  console.log('  ℹ  Some files exist with different content. To overwrite:')
  console.log('     npx ldo-ai --force')
}

console.log('')
console.log('  Next steps:')
console.log('    1. Edit ldo-config.json to set your model routing')
console.log('    2. Run /ldo-config in Claude Code for a walkthrough')
console.log('    3. Start a task: /ldo "your task description"')
console.log('')
