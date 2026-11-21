---
name: ldo-ai-workflow
description: Route non-trivial software tasks through evidence, user-approved contracts, planning, bounded implementation, independent review, and surface reconciliation. Use for multi-file, architectural, or uncertain changes.
---
<!-- managed by ldo-ai -->

# Development lifecycle

Keep the process proportionate: trivial, local, reversible work goes straight to the worker, and one concern per change keeps reviews small. For non-trivial work:

1. Reconnaissance first: inspect repository guidance, relevant code, and affected surface contracts; report evidence, real risks, and scope. For a designed or changed user-facing surface, offer a prior-art study per `ldo-ai-prior-art`. Do not plan or delegate implementation yet.
2. Get concise user approval of goal, scenarios, non-goals, affected surfaces, constraints, acceptance, and checks, with prior-art findings or a prototype when the user asked for them. Where a choice is the user's, give options with a recommendation; once they decide, do not reopen it. Save the approved feature contract before planning/coding.
3. Planner produces the simplest bounded plan; worker implements only approved scope; reviewer independently checks diff and evidence. Review rounds are bounded: after two rejecting reviews of the same change since the user's last decision, stop delegating and report outstanding findings, what each round fixed, current state, and options; wait for the user's decision.
4. Reconcile durable surface contracts after verification. Delete the temporary feature contract only after independent verification and reconciliation; otherwise retain it as `ready-for-verification`.

Ask before crossing an unapproved product/surface boundary and before outward or irreversible actions. Host-native skill discovery and delegation control loading and execution; do not build a router or workflow runtime.
