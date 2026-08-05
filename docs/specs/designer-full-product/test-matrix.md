# Designer Full Product 测试矩阵

> 状态：实施中
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 可信基线 | 1 | Renderer resource identity unit、Blueprint DOM native input、browser Layers workflow |
| R2 宿主产品 | 2、6 | Contracts adapter binding、project controller race、adapter integration、`designer-project-workspace-controller.test.ts` 的目录/预览/快照 capability UI 状态 |
| R3 作者效率 | 3 | operation/shortcut registry、DOM menus/panels、keyboard browser workflows |
| R4 画布图层 | 3 | geometry/controller unit、Layers DOM、pointer/keyboard/performance browser cases |
| R5 物料资产 | 2、4 | Contracts port binding、Material conformance（图片替代文本）、Renderer asset lifecycle/prop 投影、Inspector DOM |
| R6 资源数据 | 2、4 | Contracts canonical parser、Core action isolation、Renderer races、host adapter integration |
| R7 图形 Blueprint | 5 | Core compiler/runtime、`designer-blueprint-graph-session.test.ts` 的 canonical rule 投影、搜索、键盘导航与无写入、`designer-integration-controller.test.ts` 的模板/模拟/键盘路径、Blueprint graph adapter DOM、keyboard and pointer browser workflows |
| R8 依赖准入 | 5 | registry/license/security record、Vite gzip、Shadow DOM、`designer-blueprint-graph-session.test.ts` 的双实例/cleanup、browser tests |
| R9 产品质量 | 1-6 | test matrix reverse mapping, browser, API, boundary, tarball, provenance, verify:m0 |

新增 case 必须在名称或相邻注释中标记 R1-R9。任何 case rename、move 或 delete 必须同步本矩阵。
