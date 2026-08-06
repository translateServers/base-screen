# Designer Canvas Precision 测试矩阵

> 状态：实施中
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 瞬态移动预览 | 2、3 | `designer-gesture-controller.test.ts` 的单/多选 translate、completion 与 cancellation case；Designer browser drag workflow |
| R2 选区几何吸附 | 2、3、4 | `designer-canvas-aids.test.ts` 的 selection anchor/delta、智能/网格按距离竞争、释放带保持与同锚点跟随 case；吸附竞争数学以上游等价测试为准（`tests/common/vendor/moveable-snappable.test.ts`，checkSnap/阈值/方向/网格/参考线）；gesture 与 browser snap workflow（`assertSnapWorkflow`） |
| R3 统一坐标换算 | 1、3 | `designer-canvas-coordinates.test.ts` 的 zoom/pan case；guide DOM/browser workflow |
| R4 可靠性与性能 | 1–4 | pointer cancellation、non-zero pan/zoom、rotated candidate、`designer-workbench-controller.test.ts` 的手势会话候选缓存 case、`designer-gesture-controller.test.ts` 的会话生命周期 case、focused Engine package checks |

R2/R4 附带的变换实时预览（V10）：`designer-gesture-controller.test.ts` 的 preview/cancel-restore/commit case +
`verify-browser-harness.mjs` 的 `assertTransformPreviewWorkflow`（真实指针拖拽手柄，Material 根元素预览与提交一致）。

新增 case 必须在名称或相邻注释中标记 R1–R4。任何 case rename、move 或 delete 必须同步本矩阵。
