# Designer 事件 Blueprint 实施计划

> 状态：已决策（图形延后）；表单与 Core trace 实施待启动
> 日期：2026-08-10
> 依据：ADR-0026（已接受）、[专项 Spec](../../../specs/archive/designer-event-blueprint/spec.md)（已归档）、[ADR-0019](../../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)
> 范围依据：[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)；本计划只覆盖轻量作者内核

## 1. 执行原则

- 本期零新增外部生产依赖；不修改 `package.json`、`pnpm-lock.yaml`、`scripts/check-boundaries.mjs`、license
  notice 或 API report。
- Canonical Blueprint、Core runtime、Engine session 和宿主 ports 保持现有所有权；所有内容修改通过
  compile-then-`replace-blueprint` 的单次命令完成，失败原子不变。
- 图形路径按 ADR-0026 延后：不实现图形 UI、GraphAdapter 或图库依赖；现有按钮式投影移除，表单为唯一作者视图。

## 2. 批次

### Batch A：规范与决策门（已完成）

- 建立 ADR-0026、专项 Spec、tasks、checklist 和 test matrix；定义 Core trace 契约、表单/draft/模拟/诊断边界。
- 2026-08-10 接受 ADR-0026（图形延后、零依赖），专项 Spec 生效；范围由 ADR-0027 收敛为轻量作者内核。

### Batch B：候选评估（已完成，归档）

仓库外 spike 完成 X6、Rete（含自有 DOM/SVG renderer 纠正）、原生 DOM/SVG 与 Dagre 的同一私有 GraphAdapter/
fixture/Chromium 对比；证据与结论见 [候选评估报告](./dependency-evaluation.md)。2026-08-10 决策：图形整体延后，
本期不引入依赖。

### Batch C：表单与 Core trace 实施

1. Core：`traceScreenBlueprintEvent` 与共享纯求值内核；trace/dispatch 逐字段等价；detached JSON、预算与零宿主
   调用；错误定位诊断。
2. Engine common operations：host-action payload 编辑/删除/原规则重排（actionId 只读）、capability 推导/prune、
   三个固定模板（空事件规则/转发事件/写入变量）。
3. Engine DOM/controller：表单完整化——draft 应用/取消与未保存保护、递归表达式编辑与校验、问题面板定位、搜索
   高亮定位、模拟面板逐规则 trace、fail-closed 与中文可访问反馈；移除按钮式图形投影。
4. 所有结构变化统一走一次 `replace-blueprint`；失败保持 document/history 不变。

### Batch D：质量与交付

- 覆盖专项矩阵全部 unit/DOM/browser/visual/a11y/scale cases，维护本 Spec R7（表单部分）/R9 反向映射。
- 运行 Engine/Core focused lint、typecheck、test、build，browser、API、boundary、license、consumer bundle、
  tarball 与 `pnpm verify:m0`。
- 证据齐全后增量勾选专项 tasks/checklist；未通过项进入 fix loop，不以单次 focused
  test 替代完成定义。

## 3. 预算与终止条件

- 本期新增运行时 package = 0；任何图库、UI framework、全局 stylesheet/Store、第三方公共类型或 canonical graph
  shape 的引入直接终止并回退。
- 若未来恢复图形需求，以 2026-08-10 评估报告为基线重新执行 ADR-0019 全部门禁，再更新 ADR、Spec、boundary
  whitelist、manifest、lockfile 与许可证记录。

## 4. 当前状态

Batch A/B 已完成（文档与评估归档）。Batch C/D 待启动：方向已由用户确认并写入 ADR-0026，实施按专项
tasks.md 的 Task 2 起执行。
