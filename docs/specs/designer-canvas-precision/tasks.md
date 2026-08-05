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

- [ ] Task 3：补齐证据并完成质量门（R1–R4）。
  - [x] 覆盖坐标换算、选区 anchor、候选优先级、单/多选 translate 预览和取消清理。
  - [ ] 覆盖非零 pan/zoom 与旋转候选的浏览器级画布工作流。
  - [x] 更新 provenance、测试矩阵与上游任务映射。
  - [ ] 运行受影响检查与 `pnpm verify:m0`。
