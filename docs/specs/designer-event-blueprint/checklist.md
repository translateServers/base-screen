# Designer 事件 Blueprint 验收清单

> 状态：实施中（图形路径延后）
> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 决策门

- [x] ADR-0026 已接受（2026-08-10）：图形路径整体延后，表单为唯一作者路径，本期零新增依赖。
- [x] 候选评估已归档：X6 体积超限、Rete postinstall 硬门禁且无增益、Dagre 仅布局可选；原始证据保存在仓库外临时目录。
- [x] 生产 manifest、lockfile、boundary whitelist 和 license notice 保持未修改。

## Canonical 与 Core

- [ ] Contracts、JSON Schema、序列化和既有 dispatch 语义没有被扩展或改变。
- [ ] Core trace 与 dispatch 使用同一求值内核，成功结果逐字段等价，错误诊断定位到规则/动作。
- [ ] trace 的 output/detached JSON 独立于 plan/state，且任何路径都不调用宿主 port。

## Authoring 与产品行为

- [ ] 表单完整编辑 trigger、condition、三类 action 与递归 value expression。
- [ ] 应用/取消 draft 保护完整；切换节点、视图或关闭时未保存内容有中文可访问反馈。
- [ ] 三个固定模板只生成 canonical rule；host-action 只能编辑 payload、删除和原规则内重排，`actionId` 只读且无新增入口。
- [ ] 搜索使用高亮和定位，不删除条目；问题面板、能力撤销、失效事件、无效载荷和模拟均 fail closed。
- [ ] 模拟不调用端口、不写 history、不进入日志/遥测，且遵守现有 JSON budget。

## 质量与交付

- [ ] 1024x640、1440x900、1920x1080、窄屏提示、light/dark、forced-colors、reduced-motion 视觉与可访问性通过。
- [ ] 完整 pointer、keyboard-only、undo/redo、项目替换、容量上限、表单分页通过。
- [ ] Engine/Core focused gates、browser、API、boundary、license、consumer bundle、tarball 与 `pnpm verify:m0` 通过。
- [ ] 本 Spec 与 Designer Full Product Task 5 的任务、checklist、test matrix 和报告证据双向同步。
