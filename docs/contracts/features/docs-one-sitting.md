# Documentation rewrite: read in one sitting

Status: ready-for-verification

## Goal and user-visible behavior

Rewrite the README as one accurate start-to-finish guide for users and contributors, while keeping 3.x release history and linking legacy history at the immutable v3.0.0 tag.

## Scenarios

- New users install and use the package through native Claude Code or Codex mechanisms.
- Codex users on older CLI versions can use the guarded shell installer.
- Contributors can validate the package without running models.

## Non-goals

No changes to code, manifests, versions, runtime, workflows, prompts, skills, or normative contracts. Do not restyle AGENTS.md or CLAUDE.md.

## Affected surfaces

- [Native Claude Code and Codex package](../surfaces/native-claude-codex.md)

## Interfaces and constraints

- README is English, coherent from purpose through first use, and no more than 100 lines.
- Include exactly two GitHub-compatible Mermaid diagrams: host-controlled task lifecycle and shared-source packaging.
- Explain Claude marketplace add/update/remove, Codex Git marketplace install/update/remove and checkout development, practical use, roles/skills, fallback installer safety, boundaries, validation, contribution, license, and source without duplicating catalog prose.
- CHANGELOG retains 3.x entries verbatim except minimal clarity/format edits and links the complete pre-3.0 history at `https://github.com/aadegtyarev/ldo-ai/blob/v3.0.0/CHANGELOG.md`.
- Every changed/new file is at most 100 lines. Preserve compatibility and security caveats.

## Acceptance criteria

1. Commands and user-facing claims are checked against current source or CLI evidence.
2. README is at most 100 lines and contains exactly two mechanism diagrams.
3. Changelog includes only 3.x history and exact immutable legacy URL.
4. No code or other excluded surfaces are changed.

## Validation

Run repo-docs checker, `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, Claude plugin validation when available, `git diff --check`, and manually inspect Markdown links and Mermaid diagrams. Commit meaningful increments with one-command identity; do not change Git configuration.
