# Designer Canvas Precision 规格

> 状态：已归档（历史验收记录）
> 最近更新：2026-08-07
> 定位：以瞬态 `translate` 预览夯实大屏设计器的移动、吸附与坐标精度
> 前置：[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、[Designer Engine](../designer-engine/spec.md)、[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 来源：[Nebula Designer Core](../../../provenance/nebula-designer-core.md)

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
  吸附/变换数学以 MIT vendor 方式迁入 `common/vendor`（见 ADR-0020），不构成依赖引入，行为契约以上游
  代码为准。
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
匹配画布、参考线和其他可见组件候选。吸附 SHALL 输出统一 delta 与命中 guide metadata，使预览和最终
提交一致；被移动组件 SHALL 排除出候选集合。

智能参考线候选 SHALL 按绝对距离统一竞争（同轴取最近命中）。已吸附目标 SHALL 在捕获阈值（5px screen-pixel 语义，随 zoom 缩放）内保持吸附、超出即释放
（×1.0，对齐 Nebula/Moveable 的每帧重新判定语义，无额外释放带）；同锚点继续跟随，避免多锚点切换
抖动。吸附会话状态按轴独立，仅存在于单个手势
会话内，手势结束或吸附开关切换时 SHALL 清除。吸附锚点与选中框视觉轮廓 SHALL 基于同一选区几何（组件
视觉包围盒），吸附预览线中心与选中框边缘重合，不与控制器视觉产生偏移。移动预览 SHALL 按渲染阈值（1px，
对应 Moveable snapRenderThreshold）每轴输出**最近一条**对齐线（对齐 Moveable snapRenderInfo 单方向
语义，避免多组件画布拖拽时辅助线杂乱）。预览层 SHALL 只绘制参考线本身；
吸附（5px）与渲染（1px）分离使线只出现在渲染阈值内，锚点与参考边的残余间距恒 ≤1px，不构成有效读数，
SHALL NOT 在参考线上叠加距离标签——接近阶段无线，几乎贴合时才出现线。
若选区 anchor 与候选边或中心已精确重合（零校正），Designer 可保留吸附状态，但 SHALL 不输出该轴的
蓝色参考线；参考线只反馈渲染阈值内、确实需要非零位置修正的吸附，避免已拼接组件的边界贯穿画布。
当组件移动越过拖拽确认阈值时，Designer SHALL 以拖动选区的左/中/右与上/中/下 anchor 为测量轨道：在与可见
组件边缘或中心落入渲染阈值的轨道上，按 visual bounds 排序相邻区间，并将每个非重叠间隙绘制为蓝色虚线测量段和
红色整数数值标签（无单位）。该规则对齐 Moveable `renderDashedGuidelines`：沿同一对齐轨道从移动选区向两侧依次
标注正间距，并不把重叠区域或网格纳入测量。候选与选区在测量方向的正交投影必须存在超过渲染阈值的正重叠；
仅共享边或角的对角关系不得生成间距标注。标注只在实际移动预览期间重算；未越过点击阈值、pointer completion
或 cancellation SHALL 不显示或立即清理。它们只用于视觉反馈，绝不加入吸附候选、缓存或坐标调整。
参考线 SHALL 以对齐坐标定位并居中（CSS translate(-50%)），使任意线宽的中心与对齐坐标精确重合。
参考线层 SHALL 渲染在所有组件之上（组件 z-index 取 Core painter order 索引 0..N-1，覆盖层 z-index 由文档组件数派生，始终高于 N-1），不得被组件遮挡。
point、create、resize、rotate 路径 SHALL 复用吸附渲染阈值，并携带命中组件参考线的局部起点与长度；接近阶段不得回退为贯穿画布的辅助线。
背景网格 SHALL 仅作视觉辅助；任何 pointer、移动、缩放、旋转或创建手势均不得将网格线加入候选或执行网格坐标取整。组件、画布与用户
参考线仍按距离竞争。吸附参考线
以蓝色系（Moveable #4af 语义）渲染，吸附目标线以更粗高亮样式指示。

### R3：统一坐标换算

pointer、guide、ruler 和后续画布交互 SHALL 通过同一个 browser viewport 坐标换算边界处理 client point、
canvas content bounds、border inset 与 zoom。当前 viewport 平移由 canvas rect 表达的行为必须保持，且抽象为后续 ruler inset、
滚动容器或嵌套 transform 的单一扩展点。

### R4：可靠性与性能

在 10%–500% zoom、非零 viewport 平移、单选与多选、组件旋转候选、guide/component 冲突及 pointer cancellation
场景中，预览和提交 SHALL 可预测。每个 pointer move 仅修改必要的 preview style/overlay，不执行 document
transaction 或全量 Renderer reconciliation。候选与测量的可见性判断 SHALL 复用单次组件索引；吸附候选集合 SHALL 在每个手势会话内只收集一次（会话内文档与
参考线不变），按排除集合区分缓存；会话结束或候选集合变化时失效，避免会话间残留。

## 4. 完成定义

- `tasks.md` 和 `checklist.md` 的全部适用项均为完成状态。
- R1–R4 与 unit/DOM/browser 证据双向映射。
- Engine 受影响的 format、lint、typecheck、test、build 及最终 `pnpm verify:m0` 均通过。
