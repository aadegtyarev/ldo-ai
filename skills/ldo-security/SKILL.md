---
name: ldo-security
description: Security threat analysis of code changes — OWASP top 10, injection, auth, data exposure, supply chain
---

Invoke the security agent to audit the current diff for security vulnerabilities.

## Usage

```
/ldo-security
```

The security agent will:
1. Identify the attack surface from the diff
2. Check for 10 threat categories: injection, auth, data exposure, input validation, SSRF, supply chain, crypto, race conditions, resource exhaustion, configuration
3. Verify each finding — no speculation
4. Provide exploit scenarios and actionable fixes
5. Reference CWE codes where applicable

Use after `/ldo-reviewer` approves changes, or standalone on any diff to audit security posture.
