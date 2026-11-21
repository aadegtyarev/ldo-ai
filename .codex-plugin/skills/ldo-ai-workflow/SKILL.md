---
name: ldo-ai-workflow
description: Route non-trivial software tasks through evidence, user-approved contracts, planning, bounded implementation, independent review, and surface reconciliation. Use for multi-file, architectural, or uncertain changes.
---
<!-- managed by ldo-ai -->

# Development lifecycle

Keep the process proportionate: trivial, local, reversible work goes straight to the worker, and one concern per change keeps reviews small. For non-trivial work:

1. Slice large requests first: split them into slices that each touch the fewest surfaces and the least code, give a result the user can check, and ship on their own (contract, PR, checks, review). Agree on the slices with the user; run steps 2-5 per slice, starting the next only after the previous one is verified.
2. Reconnaissance: inspect repository guidance, relevant code, and affected surface contracts; report evidence, real risks, and scope. For a designed or changed user-facing surface, offer a prior-art study per `ldo-ai-prior-art`. Do not plan or delegate implementation yet.
3. Get concise user approval of goal, scenarios, non-goals, affected surfaces, constraints, acceptance, and checks, with prior-art findings or a prototype when the user asked for them. Where a choice is the user's, give options with a recommendation; once they decide, do not reopen it without new evidence. Save the approved feature contract before planning/coding.
4. Planner produces the simplest bounded plan; worker implements only approved scope; reviewer independently checks diff and evidence. Review rounds are bounded: after two rejecting reviews of the same change since the user's last decision, stop delegating and report outstanding findings, what each round fixed, current state, and options; wait for the user's decision. When delegating, request at least medium reasoning effort, and high for complex planning, review or architecture; never low for implementation or review.
5. Reconcile durable surface contracts after verification, keeping them compact per the meta-contract. Delete the temporary feature contract only after independent verification and reconciliation; otherwise retain it as `ready-for-verification`.

Ask before crossing an unapproved product/surface boundary and before outward or irreversible actions. Host-native skill discovery and delegation control loading and execution; do not build a router or workflow runtime.
