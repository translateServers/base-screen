# Designer Canvas Precision 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 移动与历史

- [x] 单选和多选移动在手势期间只修改对应 Material 根元素的 CSS `translate`。
- [x] preview 不写 document、Renderer model 或 history，完成时只提交一次 absolute position transaction。
- [x] 取消、lost capture、blur、replace、unload、disconnect 和工具切换清理所有 translate 与 snap overlay。

## 吸附与坐标

- [x] 选区 bounds 的 left/center/right 和 top/middle/bottom 都可匹配候选并产生统一 delta。
- [x] 画布、网格、用户 guide、可见组件及旋转组件 visual bounds 均按既定优先级参与吸附。
- [x] 智能参考线与网格候选按绝对距离统一竞争（同轴取最近命中，网格无阈值保底）。
- [x] 已吸附目标在释放带内保持、同锚点继续跟随；吸附会话按轴独立、随手势边界建立与清除。
- [x] 吸附锚点与选中框视觉轮廓基于同一选区几何，吸附预览线中心与选中框边缘重合（无视觉偏移）。
- [x] 移动预览按渲染阈值（1px）输出对齐线：吸附（5px）与渲染分离，接近阶段无线、贴合时出现线。
- [x] 参考线以对齐坐标定位并 CSS 居中，任意线宽中心与对齐坐标精确重合（参考 Moveable/Nebula 居中语义）。
- [x] 移动拖拽关闭无阈值网格取整，网格线按 5px 阈值并入候选统一竞争，网格线间允许亚像素定位。
- [x] 吸附参考线以蓝色系渲染、吸附目标线以更粗高亮指示（Moveable #4af 语义）。
- [x] 被移动组件不作为自己的候选；hidden 被排除，locked 仅作为候选且不可获得 mutation 权限。
- [x] 手势会话内吸附候选集合只收集一次（按排除集合区分缓存），会话结束或候选变化时失效。
- [x] pointer 与 guide 坐标换算复用统一 helper，并在非零 pan/10%–500% zoom 下保持确定性。

## 质量

- [x] R1–R4 有当前 unit/DOM/browser 测试映射和反向标注。
- [x] provenance、Engine format、lint、typecheck、test、build 与 `pnpm verify:m0` 通过。
