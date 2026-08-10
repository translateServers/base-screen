# Designer Full Product 测试矩阵

> 状态：已归档（保留 2026-08-10 证据快照）
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 可信基线 | 1 | Renderer resource identity unit、Blueprint DOM native input、browser Layers workflow |
| R2 宿主产品 | 2、6 | Contracts adapter binding、project controller race、adapter integration、`designer-project-workspace-controller.test.ts` 的目录/预览/快照 capability UI 状态、`designer-import-controller.test.ts` 与 `designer-workspace.test.ts`（导入确认/取消/无效 JSON 诊断明细/导出文件下载）、browser 导入导出 workflow（文件选择器→确认弹窗、无效文件诊断反馈、导出触发下载且内容与文档一致） |
| R3 作者效率 | 3 | operation/shortcut registry、DOM menus/panels、group-aware inspector context、derived group bounds、group geometry transactions、group editing context drill-in/Escape/Enter、keyboard browser workflows |
| R4 画布图层 | 3 | geometry/controller unit、Layers DOM、pointer/keyboard/performance browser cases |
| R5 物料资产 | 2、4 | Contracts port binding、Material conformance（图片替代文本）、Renderer asset lifecycle/prop、runtime isolation 投影、Inspector DOM（含组选中、多选排列与组几何动作面板） |
| R6 资源数据 | 2、4、6 | Contracts canonical parser、dataset catalog/descriptor and binding parser、Core parameter evaluation、Renderer variable/resource races、host adapter integration、Designer data panel、browser dataset workflow |
| R7 Blueprint 表单作者闭环 | 5 | Core compiler/runtime、专项矩阵 EB-R7-C01–C05、`designer-integration-controller.test.ts` 的模板/模拟/键盘路径、keyboard and pointer browser workflows（表单路径）；图形路径延后见 [ADR-0026](../../../decisions/ADR-0026-designer-event-blueprint-authoring.md) |
| R8 依赖准入 | 5 | 专项矩阵 EB-R8-C01（2026-08-10 spike 证据归档）；本期零新增依赖，无白名单/lockfile/notice 变更 |
| R9 产品质量 | 1-6 | test matrix reverse mapping, browser, API, boundary, tarball, provenance, verify:m0 |

新增 case 必须在名称或相邻注释中标记 R1-R9。任何 case rename、move 或 delete 必须同步本矩阵。
