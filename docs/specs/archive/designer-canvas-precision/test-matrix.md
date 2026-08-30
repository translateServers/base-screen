# Designer Canvas Precision 测试矩阵

> 状态：已完成
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 瞬态移动预览 | 2、3 | `designer-gesture-controller.test.ts` 的单/多选 translate、deferred pointer capture、completion 与 cancellation case；Designer browser drag workflow |
| R2 选区几何吸附 | 2、3、4、5、6、7 | `designer-canvas-aids.test.ts` 的 selection anchor/delta、Core 旋转 bounds 一致性、无网格衍生坐标、捕获阈值保持与同锚点跟随、每轴单线渲染及零校正不出线 case；`designer-canvas-measurements.test.ts` 的六个对齐轨道、相邻间隙、hidden/旋转组件、正交投影重叠与网格隔离 case；吸附竞争数学以上游等价测试为准（`tests/common/vendor/moveable-snappable.test.ts`，checkSnap/阈值/方向/参考线）；gesture、workbench DOM 与 browser snap workflow（`assertSnapWorkflow`，含拖拽确认后的间距标注、completion/cancellation 清理、×1.0 阈值保持、超阈值释放、无候选时的原始位移与辅助线对齐，以及边界重合无 snap overlay）；参考线层级由 `assertCanvasPrecision` 的 elementFromPoint 探测校验（覆盖层 z-index 由组件数派生，高于组件 painter order，参考线不得被组件遮挡） |
| R3 统一坐标换算 | 1、3 | `designer-canvas-coordinates.test.ts` 的 zoom/pan case；guide DOM/browser workflow（`assertCanvasPrecision`：ruler 拖拽创建、双击移除与 out-of-bounds 丢弃） |
| R4 可靠性与性能 | 1–7 | pointer cancellation、secondary-pointer 不捕获、deferred capture 的 viewport fallback、snap toggle 后续帧不再吸附/渲染、无命中预览不重建 guide layer、拖拽测量覆盖层出现/清理、边界重合无 overlay、non-zero pan/zoom、rotated candidate、`designer-workbench-controller.test.ts` 的手势会话候选缓存/稳定排除集合/开关清理 case、`designer-gesture-controller.test.ts` 的会话生命周期 case、focused Engine package checks |

研究报告整改（Task 8）证据：`designer-canvas-coordinates.test.ts` 的 border/content-origin case；`designer-canvas-aids.test.ts` 的 point render-threshold/local-geometry case；`designer-workbench-controller.test.ts` 的 zoom overlay scale、正常/取消 capture 与 guide double-click case；`designer-gesture-controller.test.ts` 的 locked descendant drag 与 Alt subtree parent remap case；`verify-browser-harness.mjs` 的缩放复位框选与真实参考线双击流程；候选/测量路径通过共享 `ComponentIndex`，由 Engine typecheck/build 与 focused tests 覆盖。

R2/R4 附带的变换实时预览（G10）：`designer-gesture-controller.test.ts` 的 preview/cancel-restore/commit case +
`verify-browser-harness.mjs` 的 `assertTransformPreviewWorkflow`（真实指针拖拽手柄，Material 根元素预览与提交一致）。

新增 case 必须在名称或相邻注释中标记 R1–R4。任何 case rename、move 或 delete 必须同步本矩阵。
