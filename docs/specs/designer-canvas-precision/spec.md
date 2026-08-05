# Designer Canvas Precision 规格

> 状态：生效中
> 最近更新：2026-08-05
> 定位：以瞬态 `translate` 预览夯实大屏设计器的移动、吸附与坐标精度
> 前置：[Designer Full Product](../designer-full-product/spec.md)、[Designer Engine](../designer-engine/spec.md)、[ADR-0006](../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 来源：[Nebula Designer Core](../../provenance/nebula-designer-core.md)

## 1. 目标

完善大屏设计器画布中的元素移动体验，使单选和多选元素在 pointer 手势期间只通过 CSS `translate`
进行即时预览，结束时再以一次 Core transaction 提交 canonical `position`。实现必须保持既有的
framework-neutral DOM、Renderer Material ABI、实例隔离和 fail-closed 操作边界，并在可观察行为上对齐
Nebula 画布的实时移动与吸附反馈，而非复制其 React 或 Moveable 实现。

## 2. 不变边界

- 手势过程中不得写入 canonical document、Core history 或 Material model。
- pointer completion 每次高层移动至多产生一个 transaction/history entry；取消、失去 capture、blur、replace、
  unload、disconnect 与工具切换必须完整清理预览。
- Engine 不引入 React、Moveable、Selecto、Zustand 或新的第三方依赖，也不访问 Material 内部 DOM。
- 坐标换算、选区几何和吸附状态都属于单个 Designer Engine 实例；不得以 module state 或 DOM computed style
  作为领域真相。
- hidden 组件不得成为吸附候选；locked 组件可提供候选，但不因此获得移动 mutation 权限。

## 3. Requirements

### R1：瞬态移动预览

拖拽已选组件 SHALL 在每次 pointer move 对所有选中 Material 根元素应用相同的 CSS `translate` delta。
预览 SHALL 不触发 document render 或持久化；结束时 SHALL 清除全部 translate，并将同一 delta 写成一次
absolute position transaction。

### R2：选区几何吸附

移动多选集合时，Designer SHALL 使用整个选区的 visual axis-aligned bounds 的左/中/右及上/中/下 anchor
匹配画布、网格、参考线和其他可见组件候选。吸附 SHALL 输出统一 delta 与命中 guide metadata，使预览和最终
提交一致；被移动组件 SHALL 排除出候选集合。

### R3：统一坐标换算

pointer、guide、ruler 和后续画布交互 SHALL 通过同一个 browser viewport 坐标换算边界处理 client point、
canvas bounds 与 zoom。当前 viewport 平移由 canvas rect 表达的行为必须保持，且抽象为后续 ruler inset、
滚动容器或嵌套 transform 的单一扩展点。

### R4：可靠性与性能

在 10%–500% zoom、非零 viewport 平移、单选与多选、组件旋转候选、guide/grid 冲突及 pointer cancellation
场景中，预览和提交 SHALL 可预测。每个 pointer move 仅修改必要的 preview style/overlay，不执行 document
transaction 或全量 Renderer reconciliation。

## 4. 完成定义

- `tasks.md` 和 `checklist.md` 的全部适用项均为完成状态。
- R1–R4 与 unit/DOM/browser 证据双向映射。
- Engine 受影响的 format、lint、typecheck、test、build 及最终 `pnpm verify:m0` 均通过。
