# CI Node 24 actions

Status: ready-for-verification

## Goal

Eliminate the GitHub Actions Node 20 deprecation warning by pinning official Node 24-compatible action releases, without changing package or release behavior.

## Scenarios

CI executes on push, pull request, or manual dispatch using the updated actions; existing validation steps remain unchanged.

## Non-goals

No changes to workflow commands, package version 3.2.0, changelog, manifests, prompts, or release artifacts.

## Affected surfaces

No existing surface contract: this is a CI maintenance detail, not a change to the native Claude/Codex package surface.

## Constraints

Update only `.github/workflows/ci.yml`: checkout to v7.0.1 commit `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node to v7.1.0 commit `949feb2413d6458794dcd2491c4babbbce0c15c1`. Their action.yml files were independently confirmed to use Node 24.

## Acceptance

Both uses references point to the specified commits, workflow behavior is otherwise unchanged, and this contract remains `ready-for-verification` through independent review.

## Validation

Inspect the workflow YAML and run `npm test`, `npm run check`, `sh -n scripts/install-codex.sh`, and `git diff --check`.
