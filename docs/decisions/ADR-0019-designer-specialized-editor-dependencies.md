# ADR-0019：Designer 专项编辑依赖准入

> 状态：已接受
> 日期：2026-08-05
> 扩展：[Designer 依赖引入计划](../plans/archive/designer-dependency-introduction/implementation-plan.md)
> 历史适用：[已归档 Designer Full Product](../specs/archive/designer-full-product/spec.md)
> 后续边界：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)

## 决策

扩展后的目标允许两个相互独立的 specialized dependency slots：一个用于图形 Blueprint，一个用于结构化 JSON
编辑。此 ADR 只批准限时 spike 和准入规则，不批准安装任何 package。

图形 spike 比较 `@antv/x6`、Rete stack 与原生 SVG 加 `@dagrejs/dagre`。2026-08-05 registry 快照：X6 为 MIT，
4 个直接依赖，解包 8,558,752 B；Rete core 为 MIT，依赖 `@babel/runtime`，解包 225,942 B，area plugin 解包
551,597 B；Dagre 为 MIT，依赖 graphlib，解包 1,396,866 B。`@xyflow/system` 因不稳定系统 API 与 D3 栈拒绝；
React Flow 因 React 约束拒绝；Cytoscape 与 maxGraph 因渲染/可访问性和模型适配成本不进入 spike。

JSON spike 比较 CodeMirror 与 Monaco core，优先评估 CodeMirror 的按需 JSON、diagnostic 和 completion 能力。

## 准入条件

- 依赖必须置于私有 adapter 后，不导出第三方类型、状态或 document shape。
- adapter 必须以 canonical state 为唯一提交来源，支持 Shadow DOM、双实例、keyboard 等价、disconnect cleanup 和
  package replacement。
- 安装前记录实际 Vite minified+gzip 增量、lockfile 新增数、许可证、漏洞、维护、browser matrix 和移除方案。
- 通过后才更新 Spec、boundary whitelist、manifest、lockfile 与测试矩阵；每个 slot 只允许一个已安装候选。

## 排除方案

- 预装多个候选以备未来使用：拒绝。
- 将图库的 node/edge、viewport 或 history 作为 canonical state：拒绝。
- 以 npm 解包体积替代实际 bundle 和浏览器证据：拒绝。
