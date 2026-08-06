# Designer Canvas Precision 任务

> 状态：实施中
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

- [x] Task 1：建立可复用的画布坐标换算边界（R3、R4）。
  - [x] 抽取 client point 到 canvas point 的纯 browser helper。
  - [x] 让 gesture 与 guide 交互复用该 helper，并保持已有 pan/zoom 行为。

- [x] Task 2：实现基于选区几何的 translate 拖拽预览与吸附（R1、R2、R4）。
  - [x] 记录选中 Material 根元素，并在 pointer move 同步写入同一 translate delta。
  - [x] 以选区 visual bounds 的边缘/中心 anchor 计算吸附 delta 和预览 guide。
  - [x] 在 pointer completion 使用已预览的同一 delta 生成单次 absolute position transaction。
  - [x] 在全部取消路径清理每个预览 translate 和 snap overlay。

- [x] Task 3：补齐证据并完成质量门（R1–R4）。
  - [x] 覆盖坐标换算、选区 anchor、候选优先级、单/多选 translate 预览和取消清理。
  - [x] 覆盖非零 pan/zoom 与旋转候选的浏览器级画布工作流。
  - [x] 更新 provenance、测试矩阵与上游任务映射。
  - [x] 运行受影响检查与 `pnpm verify:m0`。

- [x] Task 4：吸附体验与性能优化（R2、R4）。
  - [x] 智能参考线与网格候选按绝对距离统一竞争，网格保持无阈值保底。
  - [x] 引入释放带滞后与同锚点跟随：已吸附目标在释放带内保持，消除阈值边界与锚点切换抖动。
  - [x] 吸附会话状态按轴独立，随手势开始/结束建立与清除，不残留到会话外。
  - [x] 手势会话内缓存吸附候选集合（按排除集合区分），会话结束或候选变化时失效。
  - [x] 对齐 Moveable/Nebula 吸附视觉：蓝色系参考线、1px/2px 分级线宽、吸附目标线高亮指示、组件参考线局部几何（起点/长度）。
  - [x] 对齐 Moveable snapRenderThreshold 语义：吸附（5px）与渲染（1px）分离，接近阶段无线、贴合时出现线。
  - [x] 移动拖拽关闭无阈值网格取整，24px 网格线按 5px 阈值并入候选统一竞争（Moveable guidelines 语义）。
  - [x] 补齐 canvas-aids 竞争/滞后用例、workbench 会话缓存用例、gesture 会话生命周期用例与浏览器级吸附工作流断言。
