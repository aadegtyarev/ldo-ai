---
name: ldo-ai-workflow
description: Route non-trivial software tasks through evidence, user-approved contracts, planning, bounded implementation, independent review, and surface reconciliation. Use for multi-file, architectural, or uncertain changes.
---
<!-- managed by ldo-ai -->

# Development lifecycle

Trivial, local, reversible work goes directly to the worker. For non-trivial work:

1. Reconnaissance first: inspect repository guidance, relevant code, and affected surface contracts; report evidence, risks, and scope. Do not plan or delegate implementation yet.
2. Get concise user approval of goal, scenarios, non-goals, affected surfaces, constraints, acceptance, and checks. Save the approved feature contract before planning/coding.
3. Planner produces a bounded evidence-based plan; worker implements only approved scope; reviewer independently checks diff and evidence.
4. Reconcile durable surface contracts after verification. Delete the temporary feature contract only after independent verification and reconciliation; otherwise retain it as `ready-for-verification`.

Ask before crossing an unapproved product/surface boundary. Host-native skill discovery and delegation control loading and execution; do not build a router or workflow runtime.
