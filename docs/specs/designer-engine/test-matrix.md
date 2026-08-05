# Designer Engine 测试映射

> 依据：[spec.md](./spec.md) · [tasks.md](./tasks.md) · [checklist.md](./checklist.md)

本矩阵是现行 R1-R10 与自动化证据的双向索引。测试名称或 browser harness 断言发生变化时，必须同步更新本文件。

| Requirement | Task | 自动化证据 | 覆盖行为 |
| --- | --- | --- | --- |
| R1 Engine 单一编排 | Task 2、5、7 | `designer-session.test.ts`、`project-controller.test.ts`、`verify-browser-harness.mjs` | document/history/interaction 会话，replace/load/unload，项目操作 |
| R2 统一 Operation | Task 2、4、9 | `designer-operation-registry.test.ts`、`designer-tools.test.ts`、`verify-browser-harness.mjs` | id 唯一性、available/enabled、toolbar、快捷键、工具和 pointer completion |
| R3 中文单语言界面 | Task 3、4、9 | `designer-ui-text.test.ts`、`designer-viewport.test.ts`、`check-designer-ui.mjs`、`verify-browser-harness.mjs` | 固定词汇、tooltip、tab、状态、对话框、无 locale/i18n |
| R4 原子编辑与历史 | Task 5、9 | `designer-session.test.ts`、`designer-operations.test.ts`、`designer-gesture-controller.ts`、`verify-browser-harness.mjs` | create/drag/transform 一次提交，clipboard/layout transaction，undo，renderer reject 原子性 |
| R5 选择与画布一致性 | Task 5、9 | `designer-layers-dom.test.ts`、`designer-gesture-controller.ts`、`verify-browser-harness.mjs` | Core interaction reducer、marquee、layers/canvas 选择和 overlay |
| R6 Capability 驱动工作台 | Task 4、6、8、9 | `designer-tools.test.ts`、`designer-panel-dom.test.ts`、`verify-browser-harness.mjs` | 物料映射、工具 absent、property/data capability、publish capability |
| R7 项目生命周期 | Task 7、9 | `project-controller.test.ts`、`verify-browser-harness.mjs` | generation、abort、adapter rebind、revision guard、single-flight、retry、dirty、conflict、reload |
| R8 实例隔离 | Task 2、5、7、9 | `designer-session.ts`、`designer-clipboard.ts`、`project-controller.test.ts` | session、clipboard、project controller、viewport/workbench 实例状态 |
| R9 渐进可用 | Task 3、4、6、8、9 | `designer-import-controller.ts`、`designer-integration-controller.ts`、`verify-browser-harness.mjs` | direct authoring、preview、import confirmation、缺失 capability 的 absent/disabled |
| R10 可验证工作台 | Task 3、4、9、10 | `verify-browser-harness.mjs`、`check-designer-ui.mjs`、`pnpm verify:m0` | 1024x640/1440x900/1920x1080/窄屏、geometry、overflow、overlay containment、keyboard、中文、质量门 |

## 测试到 Requirement

| 自动化证据 | Requirements |
| --- | --- |
| `packages/engine/tests/common/operations/designer-operation-registry.test.ts` | R2、R8 |
| `packages/engine/tests/common/session/designer-session.test.ts` | R1、R4、R5、R8 |
| `packages/engine/tests/common/tools/designer-tools.test.ts` | R2、R3、R6 |
| `packages/engine/tests/common/operations/designer-operations.test.ts` | R4、R5、R8 |
| `packages/engine/tests/browser/dom/designer-panel-dom.test.ts` | R4、R6 |
| `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts` | R4、R6、R9 |
| `packages/engine/tests/browser/dom/designer-blueprint-dom.test.ts` | R6、R9 |
| `packages/engine/tests/browser/dom/designer-layers-dom.test.ts` | R5、R6 |
| `packages/engine/tests/browser/controllers/designer-gesture-controller.test.ts` | R4、R5、R8 |
| `packages/engine/tests/browser/dom/designer-selection-dom.test.ts` | R4、R5、R8 |
| `packages/engine/tests/browser/viewport/designer-viewport.test.ts` | R3、R8 |
| `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts` | R4、R8 |
| `packages/engine/tests/common/project/project-controller.test.ts` | R1、R7、R8 |
| `packages/engine/tests/common/ui-text/designer-ui-text.test.ts` | R3 |
| `scripts/check-designer-ui.mjs` | R3、R10 |
| `scripts/verify-browser-harness.mjs` | R2、R3、R4、R5、R6、R7、R9、R10 |
| `pnpm verify:m0` | R1-R10 的 package/build/API/tarball 质量门 |
