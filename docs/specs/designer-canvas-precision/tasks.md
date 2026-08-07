# Designer Canvas Precision 任务

> 状态：已完成
> 当前进行：无
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
  - [x] 组件、画布与用户参考线候选按绝对距离统一竞争。
  - [x] 捕获阈值内保持与同锚点跟随：已吸附目标在 5px 捕获阈值内保持、超出即释放（×1.0，对齐 Nebula/Moveable 每帧判定，无额外释放带），避免锚点切换抖动。
  - [x] 吸附会话状态按轴独立，随手势开始/结束建立与清除，不残留到会话外。
  - [x] 手势会话内缓存吸附候选集合（按排除集合区分），会话结束或候选变化时失效。
  - [x] 对齐 Moveable/Nebula 吸附视觉：蓝色系参考线、1px/2px 分级线宽、吸附目标线高亮指示、组件参考线局部几何（起点/长度）。
  - [x] 对齐 Moveable snapRenderThreshold 语义：吸附（5px）与渲染（1px）分离，接近阶段无线、贴合时出现线。
  - [x] 背景网格仅作视觉辅助，不参与吸附、候选缓存或坐标取整。
  - [x] 补齐 canvas-aids 竞争/滞后用例、workbench 会话缓存用例、gesture 会话生命周期用例与浏览器级吸附工作流断言。

- [x] Task 5：移除网格吸附链路（R2、R4）。
  - [x] 移除网格候选、坐标取整、预览标记和缓存分支；背景网格仅保留视觉开关。
  - [x] 覆盖 point（缩放/旋转等）和 selection drag 在无候选命中时保持原始坐标，并更新浏览器工作流与质量门。

- [x] Task 6：按对齐轨道渲染组件间距标注（R2、R4）。
  - [x] 以选区六个 anchor 与可见组件 visual bounds 计算相邻非重叠间隙；网格不得参与。
  - [x] 仅在越过组件拖拽确认阈值后的移动预览中渲染蓝色虚线测量段与红色整数标签；完成或取消立即清理。
  - [x] 覆盖移动预览、未越过阈值、hidden/旋转组件与浏览器交互，并重新完成质量门。

- [x] Task 7：收紧已重合边界的吸附与测量显示（R2、R4）。
   - [x] 选区与候选边或中心零校正重合时保留吸附结果，但不输出贯穿画布的 x/y 吸附线。
   - [x] 间距轨道要求正交方向存在有效投影重叠，排除仅共享边或角的伪间距。
   - [x] 覆盖纯几何、DOM 覆盖层回归，并重新完成质量门。

- [x] Task 8：按研究报告整改自研吸附与辅助线的实际边界（R2、R3、R4）。
  - [x] 统一扣除画布边框后的内容原点，并让 pointer、guide 与 ruler 共用该坐标语义。
  - [x] 让 point、create、resize、rotate 路径共用吸附渲染阈值与局部参考线几何。
  - [x] 复用单次组件索引完成候选/测量可见性判断，并确保锁定后代不进入移动预览或提交。
  - [x] 让辅助线、测量标注和参考线命中区在 zoom 变化下保持稳定的屏幕像素语义。
  - [x] 修复取消参考线手势后的双击状态残留，并保持 Alt 复制子树的父子关系。
  - [x] 更新 R2–R4 测试矩阵并通过受影响检查与最终质量门。
