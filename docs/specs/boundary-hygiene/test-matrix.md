# Boundary Hygiene 测试矩阵

> 状态：生效中
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 消除 browser 反向依赖 | 1 | `check-engine-import` 子层 Gate 的 `dom→controllers` 回归样例；`designer-blueprint-dom` 与 `designer-blueprint-graph-session` 的导入改写后 typecheck 通过 |
| R2 子层方向门禁 | 2 | `check-engine-import` 子层 Gate 的 browser/common 方向 case；能正向拦截 `dom→controllers` |
| R3 UI 文案收敛 | 3 | `check-designer-ui` 全量 `browser/` 树 CJK 内联文案拦截；`designer-ui-text.test.ts` 及 `designer-interaction-dom`、`designer-workspace`、`designer-selection-dom`、`designer-project-workspace-controller`、`designer-notification-controller`、`designer-panel-controller`、`designer-integration-controller` 对 `DESIGNER_UI_TEXT` 消费断言 |
| R4 完成定义 | 4 | Engine format、lint、typecheck、test、build 及 `pnpm verify:m0` 通过 |

新增 case 必须在名称或相邻注释中标记 R1–R4。任何 case rename、move 或 delete 必须同步本矩阵。