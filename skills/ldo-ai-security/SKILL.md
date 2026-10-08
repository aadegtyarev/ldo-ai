---
name: ldo-ai-security
description: Use when changes touch credentials, sensitive data, authentication, authorization, permissions, untrusted input, or external trust boundaries.
---
<!-- managed by ldo-ai -->

# Security review

- Trace sensitive data and trust boundaries through the changed path; minimize exposure and retention.
- Validate untrusted input at the boundary and enforce authorization where the protected operation occurs.
- Avoid logging secrets or returning sensitive detail in errors. Preserve explicit failure handling.
- Add focused tests for changed security guarantees and denial/failure cases when applicable.
- Report unresolved threat assumptions; do not invent a security model or claim protection not supported by code and tests.
