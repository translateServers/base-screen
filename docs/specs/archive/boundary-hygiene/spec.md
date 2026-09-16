# Boundary Hygiene 规格

> 状态：已归档（历史验收记录）
> 最近更新：2026-08-06
> 定位：将 AGENTS.md「分层与边界」中的高内聚低耦合约定落实到代码与自动化门禁
> 前置：[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0017](../../../decisions/ADR-0017-designer-product-host-boundaries.md)、[Directory Structure Rules](../directory-structure-rules/spec.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 1. 目标

AGENTS.md 已书面定义 `engine/common` 与 `engine/browser` 内部子层的单向依赖方向、UI 文案集中边界，
以及 browser 子层不得反向依赖 controllers 的约定；但当前仓库仍存在与该约定冲突的代码，且没有自动化
门禁强制这些子层方向。本规格把这些约定从文档落地为代码与检查：消除现存反向依赖、把用户可见文案收敛到
`common/ui-text`、并在 `check-engine-import` 中新增子层方向门禁，使 AGENTS.md 规则可执行、可验收。

## 2. 现状证据（违规清单）

- __browser 子层反向依赖__：`browser/dom/designer-blueprint-dom.ts` 从 `../controllers/designer-blueprint-graph-session.js`
  导入 `DesignerBlueprintGraphProjection` 类型，违反「dom 不得依赖 controllers」。
- __UI 文案内联__：约 20+ 处用户可见字符串（`textContent`、`aria-label`、面板标题、空态、占位符等）散落在
  `browser/dom` 与 `browser/controllers`，而 `common/ui-text/designer-ui-text.ts` 仅含少量键。
- __无子层方向门禁__：`check-engine-import.mjs` 只校验 `common↔browser` 单向与 browser 全局隔离，不校验
  browser/common 内部子层方向。
- __common 子层现状合规__：`session→project`、`operations→project/tools` 均符合约定，无需改代码，仅需门禁锁定。

## 3. 不变边界

- 不改变 `@base-screen/*` 公共导出与任何跨包公共契约；不新增第三方依赖。
- 不改变 renderer/viewer 的运行时行为与 Material ABI；不修改 Material DOM。
- `common/` 不得引用浏览器全局；`browser/` 可依赖 `common/`，反向禁止（既有 `check-engine-import` Gate 保持）。
- 子层依赖方向只允许下列明确路径；未列出的跨子层依赖一律禁止。

## 4. Requirements

### R1：消除 browser 子层反向依赖

`browser/dom` 不得从 `browser/controllers` 导入任何符号。`DesignerBlueprintGraphProjection` 类型 SHALL
下沉至 `common/operations/designer-blueprint-authoring.ts`（或等价 lower-layer 位置），由 `dom` 与 `controllers`
共同消费，dom 不再反向导入控制器。整改后 `browser/dom` 对 browser 其他子层的依赖仅允许指向 `ui`。

### R2：子层依赖方向自动化门禁

`check-engine-import.mjs` SHALL 新增一个 Gate，静态校验 engine 内子层方向：

- __browser__：`ui`、`styles`、`viewport` 为叶子，不得依赖兄弟子层；`dom` 可依赖 `common` 与 `ui`，不得依赖
  `controllers`；`controllers` 可依赖 `dom`、`viewport`、`common`。
- __common__：`ui-text`、`tools`、`project` 相互独立，不得互相依赖；`operations` 可依赖 `project`、`tools`
  及同层 `operations`；`session` 可依赖 `project`、`operations`。

违反以上方向即抛出门禁错误。该门禁随现有 `check-engine-import` 在 `pnpm verify:m0` 中执行。

### R3：UI 文案全量收敛

所有用户可见字符串（面板标题、空态、占位符、`aria-label`、按钮/提示文案等）SHALL 收敛到
`common/ui-text/designer-ui-text.ts` 的 `DESIGNER_UI_TEXT`，由 `browser/dom` 与 `browser/controllers` 引用，
不得在 `browser/` 内联硬编码。内部诊断/错误 message（非用户可见 UI 文案，如 rethrow 的 `Canonical document
import failed.` 类）不在此列，但不得回流为 UI 展示文案。`check-designer-ui.mjs` SHALL 扩展为覆盖整个
`browser/` 树，禁止新增内联用户可见文案。

### R4：完成定义与质量门

- `tasks.md` 与 `checklist.md` 全部适用项完成。
- R1–R3 的行为由门禁脚本与既有测试双向覆盖，`test-matrix.md` 反映当前 case。
- Engine format、lint、typecheck、test、build 及最终 `pnpm verify:m0` 全部通过。

## 5. 完成定义

- `check-engine-import` 新增子层方向 Gate 通过，且能在回归样例中正向拦截 `dom→controllers`。
- `browser/dom` 与 `browser/controllers` 不再内联用户可见文案，全部经 `DESIGNER_UI_TEXT`。
- `check-designer-ui` 全量覆盖 `browser/`，无新增内联文案违规。
- 全部受影响质量门通过 `pnpm verify:m0`。