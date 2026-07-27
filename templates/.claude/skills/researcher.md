---
name: researcher
description: Deep multi-source research on a topic — web search, cross-verify, synthesise findings
---

Invoke the researcher agent to investigate a topic with multi-source web search.

## Usage

```
/researcher "best practices for real-time WebSocket auth in distributed systems"
```

The researcher will:
1. Decompose the topic into sub-questions
2. Search multiple sources (docs, blogs, GitHub, forums)
3. Cross-verify key claims against independent sources
4. Synthesise a structured report with confidence levels and recommendations
5. Flag contradictory findings and knowledge gaps

Use before `/planner` when the task requires domain knowledge, or standalone when you need a researched answer.
