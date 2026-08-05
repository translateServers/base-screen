# Designer Canvas Precision 测试矩阵

> 状态：实施中
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 瞬态移动预览 | 2、3 | `designer-gesture-controller.test.ts` 的单/多选 translate、completion 与 cancellation case；Designer browser drag workflow |
| R2 选区几何吸附 | 2、3 | `designer-canvas-aids.test.ts` 的 selection anchor/delta case；gesture 与 browser snap workflow |
| R3 统一坐标换算 | 1、3 | `designer-canvas-coordinates.test.ts` 的 zoom/pan case；guide DOM/browser workflow |
| R4 可靠性与性能 | 1–3 | pointer cancellation、non-zero pan/zoom、rotated candidate、focused Engine package checks |

新增 case 必须在名称或相邻注释中标记 R1–R4。任何 case rename、move 或 delete 必须同步本矩阵。
