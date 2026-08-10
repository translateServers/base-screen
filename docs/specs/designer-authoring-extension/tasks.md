# 轻量 Designer 作者扩展任务

- [ ] Task 1：冻结作者扩展决策与现有 Spec 职责。
  - [ ] 新增并接受“宿主作者桥与 Material Editor Descriptor”ADR，明确 Base Screen 与宿主的所有权、依赖限制和移除路径。
  - [ ] 更新 `designer-event-blueprint` 的生效范围、任务、清单与测试矩阵，使其与新的宿主桥职责不冲突。
  - [ ] 更新 Spec 索引与已归档 Designer Full Product 的范围说明，确认 ECharts、Blueprint editor 与 code editor 的宿主归属。

- [ ] Task 2：建立作者面板 fixture、缺口矩阵和验收基线。
  - [ ] 为 scalar、nested object、array、host dataset 与 material event 建立最小 fixture，并记录 target、默认值、非法输入、深度、字节限制与预期控件。
  - [ ] 建立 desktop、窄屏、forced-colors、reduced-motion、keyboard、screen reader 与双实例的面板测试矩阵。
  - [ ] 将每个缺口归类为可复用 primitive 或宿主编辑器，避免通过物料私有 UI 扩大 Engine。

- [ ] Task 3：实现 Editor Descriptor Contracts、Plugin Core 与 SDK 基础。
  - [ ] 定义 JSON-safe Descriptor、section、field、target、path、condition、scalar control 与结构化 event declaration 的 parser、限制和诊断。
  - [ ] 在 `plugin-sdk` 提供纯数据 builder 或 validator，并在一个官方基础物料接入 Descriptor fixture。
  - [ ] 覆盖未知键、危险 path、循环或非 JSON 值、超深或超大 Descriptor、错误 enum、round-trip、schema golden、API 与 tarball consumer。

- [ ] Task 4：实现内建面板 primitives 与 canonical 路径写入。
  - [ ] 实现 section、分组、折叠、排序、帮助文本、条件显隐和稳定错误定位。
  - [ ] 实现受限 nested object path、array、repeatable array、reorderable array 与通用 selector primitives，并通过 Core transaction 写入。
  - [ ] 验证 keyboard、焦点、disabled、readonly、invalid、busy、empty、reset、窄屏、双实例与无布局抖动。

- [ ] Task 5：实现数据、交互与结构化事件声明的投影。
  - [ ] 将 data descriptor 映射到既有 host dataset、字段角色和参数意图，不引入真实数据执行或第二状态源。
  - [ ] 将 interaction descriptor 映射至既有 props、style、design capability 或 Blueprint 语义。
  - [ ] 将结构化 event declaration 接入事件列表、payload 校验、能力提示和 Blueprint trigger 选择，并覆盖 fail-closed 诊断。

- [ ] Task 6：实现宿主作者桥、专用提交入口与 harness。
  - [ ] 在 contracts 定义 authoring request、detached context、commit result 及其 JSON 和容量限制。
  - [ ] 在 engine 实现 requestId、expected revision、组件身份、unload/dispose 与双实例 guard。
  - [ ] 提供 component text edit 与 Blueprint edit 的专用公开提交方法，并确保有效提交只有一个 history entry。
  - [ ] 在 browser harness 添加位于 Shadow DOM 外的宿主 shell，验证 valid、invalid、stale、取消与实例隔离路径。

- [ ] Task 7：迁移 Blueprint 与结构化文本编辑的宿主闭环。
  - [ ] 将 Base 内部事件面板收敛为摘要、能力状态和宿主请求入口，保留 Core parse、compile、trace 与 replace command。
  - [ ] 让宿主 Blueprint editor 仅提交 canonical Blueprint，并定义组件切换、取消、关闭、reload 与 dispose 的 session invalidation。
  - [ ] 让宿主文本编辑器处理 props、style、data parameter 与受限 expression 的文本输入，并验证 source bytes、JSON depth、复杂度、未知字段和 stale revision 诊断。

- [ ] Task 8：完成 ECharts 语义面板试点。
  - [ ] 依次支持标题、图例、网格、坐标轴、单一 series、重复 series、字段绑定、颜色、基础数值、多轴、条件字段与高级折叠。
  - [ ] 将 tooltip、hover、select、click 写入 props 或 Blueprint，不写入私有运行态。
  - [ ] 提供宿主高级 option 编辑出口，并在提交前经 Material schema 或 adapter 校验；评估 field selector、array editor、color 与 unit number 的跨物料复用。

- [ ] Task 9：完成交付验证与证据回写。
  - [ ] 覆盖 contracts、plugin-core、core、engine、material、plugin-sdk 的单元、DOM、browser、双实例、容量、可访问性与消费者案例。
  - [ ] 验证宿主仅通过 `@base-screen/*` exports 集成，默认 bundle 与 tarball 不含编辑器依赖、源码持久化或私有路径引用。
  - [ ] 运行受影响包的 focused gates 与 `pnpm verify:m0`，将自动化证据同步至生效 Spec、测试矩阵与清单。

# Task Dependencies

- Task 2 依赖 Task 1。
- Task 3 依赖 Task 1 和 Task 2。
- Task 4、Task 5 与 Task 6 依赖 Task 3；Task 4 与 Task 6 可并行推进。
- Task 7 依赖 Task 5 和 Task 6。
- Task 8 依赖 Task 4、Task 5 和 Task 6。
- Task 9 依赖 Task 4 至 Task 8。
