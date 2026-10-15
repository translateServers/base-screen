# 测试清理 PR（test:audit 生成）

> 本文件由 `pnpm test:audit --emit-pr` 渲染 `scripts/fixtures/test-cleanup-pr-template.md` 生成，
> 仅作清理 PR 描述草稿。删除任何测试前必须由维护者逐条确认，全量门禁（verify:m0）通过后方可合入。

## 摘要

- 生成时间：{{GENERATED_AT}}
- 扫描测试文件总数：{{TOTAL_TEST_FILES}}
- 高置信清理候选：{{HIGH_COUNT}}（文件级综合分 ≥ 0.7）
- 观察区候选：{{OBSERVE_COUNT}}（0.4 ≤ 综合分 < 0.7）
- 仅记录不进候选：{{RECORD_COUNT}}（综合分 < 0.4）

## 候选清单

| 文件 | 规则 | 综合分 | 置信区 | 证据摘要 |
| --- | --- | --- | --- | --- |
{{CANDIDATE_TABLE}}

## 清理前后对账

| 指标 | 清理前 | 清理后 |
| --- | --- | --- |
| 测试文件总数 | {{BEFORE_FILES}} | {{AFTER_FILES}} |
| 全量测试结果 | {{BEFORE_RESULT}} | {{AFTER_RESULT}} |

## 确认清单

- [ ] 已逐条确认候选不再被任何入口引用（含跨包消费与文档示例）
- [ ] 清理后 `pnpm test` 全量通过
- [ ] 覆盖率对账无下降（清理前后各跑一次目标包 vitest --coverage）
