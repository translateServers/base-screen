# Designer Full Product 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 基线

- [x] Blueprint 原生字段在 capability 可用时可编辑、不可用时禁用。
- [x] host-resource 的 type、resource id 和 params 任一变化均触发正确 resolve。
- [x] browser 层级 workflow 是实际执行的测试，或矩阵不再声称覆盖。

## 架构与安全

- [x] 宿主目录、预览、快照、资产、资源和 action port 均 capability-gated 且 fail closed。
- [x] document、日志、fixture 和 UI 不含 URL、header、token、SQL、脚本或凭证。
- [x] 图形 session state 不进入 canonical document/history/export。
- [x] 外部依赖保持私有 adapter、双实例隔离和可移除性。

## 产品能力

- [ ] 编辑器、图层、画布、物料、检查器、资产、数据、变量、Blueprint 和项目产品闭环可用。
- [ ] 图形 Blueprint 与键盘表单路径编辑同一 canonical rule。
- [ ] 保存、发布、预览、资源和恢复的竞态、取消、失败和权限反馈具有中文可访问状态。
- [x] 宿主数据集目录选择、参数求值、字段绑定、表格/图表预览、变量定向重取和手动刷新满足 [Host Dataset Integration](../host-dataset-integration/checklist.md)。

## 质量

- [ ] 每个 Requirement 有双向测试映射和当前证据。
- [ ] browser 覆盖双实例、键盘、pointer、desktop、窄屏、forced-colors 和 reduced-motion。
- [ ] API、boundary、tarball、provenance 和 `pnpm verify:m0` 通过。
