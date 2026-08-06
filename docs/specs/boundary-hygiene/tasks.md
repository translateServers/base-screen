# Boundary Hygiene 任务

> 状态：已完成
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

- [x] Task 1：消除 `dom → controllers` 反向依赖（R1）。
  - [x] 将 `DesignerBlueprintGraphProjection` 类型下沉至 `common/operations/designer-blueprint-authoring.ts`。
  - [x] 更新 `designer-blueprint-dom.ts` 与 `designer-blueprint-graph-session.ts` 的导入，移除 dom 对 controllers 的依赖。
  - [x] 确认 `browser/dom` 对 browser 其他子层的依赖仅指向 `ui`。

- [x] Task 2：在 `check-engine-import.mjs` 新增子层方向 Gate（R2）。
  - [x] 实现 browser 子层方向校验（ui/styles/viewport 叶子、dom↛controllers、controllers→dom/viewport/common）。
  - [x] 实现 common 子层方向校验（leaves 独立、operations→project/tools/operations、session→project/operations）。
  - [x] 加入回归样例，验证能正向拦截 `dom→controllers`。

- [x] Task 3：UI 文案全量收敛（R3）。
  - [x] 扩展 `common/ui-text/designer-ui-text.ts` 的 `DESIGNER_UI_TEXT`，覆盖全部用户可见文案。
  - [x] 迁移 `browser/dom` 与 `browser/controllers` 内联文案为 `DESIGNER_UI_TEXT` 引用。
  - [x] 扩展 `check-designer-ui.mjs` 覆盖整个 `browser/` 树，拦截新增内联文案。

- [x] Task 4：补齐证据并完成质量门（R1–R4）。
  - [x] 更新 `test-matrix.md` 与上游任务映射。
  - [x] 运行 Engine 受影响检查与 `pnpm verify:m0`。