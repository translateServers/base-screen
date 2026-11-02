### 变更说明

<!-- 做了什么、为什么。涉及契约、包边界或长期决策时，给出对应 ADR/Spec 依据。 -->

### 变更类型

- [ ] 新功能（feat）
- [ ] 缺陷修复（fix）
- [ ] 文档（docs）
- [ ] 重构 / 构建 / 测试（refactor / build / test）

### 自查清单

- [ ] `pnpm verify:m0` 通过（或日常改动至少 `pnpm verify:fast`）
- [ ] 影响公共 API 时已运行 `pnpm api:report` 并补充 Changeset
- [ ] 涉及架构决策 / 包边界 / 多阶段迁移时已在变更说明中写明取舍
- [ ] 已在 browser-harness 中查看受影响的专项案例
