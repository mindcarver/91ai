# 结构化输出：让 Agent 结果能被机器继续处理

**TL;DR：** 自动化场景里，Claude Code 不能只输出自然语言。结构化输出让后续脚本、CI、看板和审计系统继续处理结果。

## 问题

“这个 PR 看起来没问题”对人类有用，但对流水线没用。CI 需要知道是否通过、有哪些 findings、严重等级、文件位置和建议动作。

## 推荐格式

```json
{
  "status": "needs_review",
  "findings": [
    {
      "severity": "high",
      "file": "src/auth.ts",
      "summary": "Missing permission check",
      "recommendation": "Verify role before update"
    }
  ],
  "tests_run": ["npm test"],
  "residual_risks": ["No integration test for admin flow"]
}
```

## 适合场景

- PR review。
- Issue triage。
- CI failure analysis。
- Release note generation。
- Security scan summary。

## 落地练习

把一个自然语言 review 命令改成 JSON 输出。再写一个小脚本读取 JSON，按 severity 决定是否阻塞 CI。

## 权衡

结构化输出会降低表达自由度。可以同时输出：机器 JSON + 人类摘要。
