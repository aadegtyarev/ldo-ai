---
name: ldo-ai-security
description: Use when changes touch credentials, sensitive data, authentication, authorization, permissions, untrusted input, or external trust boundaries.
---
<!-- managed by ldo-ai -->

# Security review

- Scale the depth to the real exposure of the changed path: who can reach it, what they gain. Trace sensitive data and trust boundaries there; minimize exposure and retention.
- Validate untrusted input once, at the boundary, and enforce authorization where the protected operation occurs. Prefer the platform's existing mechanism to new security code.
- Never weaken an existing protection for convenience. Equally, do not add layers against threats the deployment does not face; state the assumption instead.
- Avoid logging secrets or returning sensitive detail in errors. Preserve explicit failure handling.
- Add focused tests for changed security guarantees and their denial/failure cases.
- Report unresolved threat assumptions; do not invent a security model or claim protection not supported by code and tests.
