# Designer Authoring Extension 测试矩阵

> 状态：生效中
> 依据：[spec.md](./spec.md)、[tasks.md](./tasks.md)、[checklist.md](./checklist.md)

## Contracts / Plugin Core / Plugin SDK

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-DC-C01 | Declarative Material Editor Descriptor | plugin-core | descriptor 的 section/field/target/path/condition/control 白名单、必填与 round-trip；官方物料 Descriptor fixture 解析 |
| AE-DC-C02 | Descriptor 失败关闭 | plugin-core | 未知键、危险 path、非 JSON 值、循环、超深 schema、超深/超大 payload、错误 enum、重复 id 均返回定位诊断且不注册 |
| AE-DC-C03 | 容量限制 | plugin-core | 字段数、section 数、array item、condition 数、schema depth、manifest bytes、事件声明上限与定位诊断 |
| AE-DC-C04 | Structured Event Declarations | plugin-core | canonical event name、label/hint、payload schema、JSON budget、trigger context、capability 的解析与错误路径 |
| AE-DC-C05 | schema golden / API / consumer | Package | contracts 与 plugin-core 的 schema golden 未漂移；API report 含新类型；tarball consumer 可导入 Descriptor 类型与 parser |
| AE-DC-C06 | builder/validator | plugin-sdk | 纯数据 builder 生成合法 Descriptor；错误输入返回定位诊断；官方物料经 createMaterialDefinition 通过 |

## Core

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-CR-C01 | canonical 路径写入 | Core | 标量/嵌套 object/array/repeatable array 的纯转换；非法候选原子失败，document/history 不变 |
| AE-CR-C02 | Blueprint 提交 | Core | compile-then-`replace-blueprint` 单 history entry；期望 revision 不匹配、组件删除、document replace 与 undo/redo 语义 |
| AE-CR-C03 | trace/dispatch 等价 | Core | `traceScreenBlueprintEvent` 与 `dispatchScreenBlueprintEvent` 同一内核、逐字段等价（见 designer-event-blueprint 矩阵 EB-R7-C01/C02） |

## Engine DOM / Browser

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-ED-C01 | 面板 primitives | Engine DOM | section、分组、折叠、排序、帮助文本、条件显隐与稳定错误定位的 DOM 结构 |
| AE-ED-C02 | 控件状态 | Engine DOM | disabled、readonly、invalid、busy、empty、reset 六态与 keyboard/focus 行为，状态切换无布局抖动 |
| AE-ED-C03 | 嵌套与受限数组 | Engine DOM | nested object path、array、repeatable array、reorderable array、selector primitives 经 Core transaction 写入唯一 canonical 状态源 |
| AE-ED-C04 | 数据/交互投影 | Engine DOM | data descriptor 映射到既有 host dataset/字段角色/参数意图；interaction descriptor 投影到 props/style/design capability/Blueprint，无第二状态源 |
| AE-ED-C05 | 结构化事件接入 | Engine DOM | 事件列表、payload 校验、能力提示与 Blueprint trigger 选择；fail-closed 定位诊断 |
| AE-ED-C06 | 内部事件面板收敛 | Engine DOM | 只呈现事件摘要、能力状态与 JSON-safe 宿主作者请求入口；无 Engine 内部表单/图形作者工作流 |
| AE-ED-C07 | 宿主作者桥 | Engine DOM/browser | authoring request（requestId/revision/身份/快照）→ 宿主编辑 → 专用 commit → 单 history entry；取消/陈旧/跨实例/dispose fail closed |
| AE-ED-C08 | 文本编辑诊断 | Engine DOM | props/style/data parameter/expression 文本输入的 source bytes、JSON depth、复杂度、未知字段与 stale revision 诊断 |
| AE-ED-C09 | 双实例与清理 | Engine browser | 双实例隔离（requestId/实例生命周期）、监听清理、unload/dispose 后提交拒绝 |
| AE-ED-C10 | 视觉矩阵 | Chromium | desktop/窄屏/forced-colors/reduced-motion/keyboard-only/screen reader/长文本/滚动稳定性截图与 a11y 断言 |

## ECharts 语义试点

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-EC-C01 | 基础语义配置 | material/Engine DOM | 标题、图例、网格、坐标轴、单一 series、重复 series、字段绑定、颜色、基础数值经受限语义 Descriptor 配置；常见折线/柱状图无需 raw option |
| AE-EC-C02 | 交互写入 | material/Engine DOM | tooltip、hover、select、click 写入 props 或 Blueprint，不写入私有运行态 |
| AE-EC-C03 | 高级折叠与多轴 | material | 多轴、条件字段、高级折叠有明确 schema 与容量限制；复杂 option 只作为宿主高级编辑器输入，提交前经 Material schema/adapter 校验 |
| AE-EC-C04 | 跨物料复用评估 | material/Engine DOM | field selector、array editor、color、unit number primitive 的多物料用例与提升评估记录 |

## 宿主消费方

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-HB-C01 | 公共 exports 集成 | harness/consumer | browser-harness 宿主 shell 位于 Shadow DOM 外，仅经 `@base-screen/*` exports 获取 detached context 与提交 candidate |
| AE-HB-C02 | bundle 卫生 | Package | 默认 bundle 与 tarball 不含编辑器依赖、源码持久化或 `packages/*/src` 私有路径引用；`check:engine-import` 无副作用通过 |
| AE-HB-C03 | 源码编译失败 | harness | 宿主编译失败保留旧 catalog、合法 document 与 Designer session，诊断只由宿主显示 |
| AE-HB-C04 | 容量与陈旧提交 | harness | 超限/无效/陈旧/跨实例候选不修改 document、history 或其他实例 |

## 质量门

- [ ] AE-GATE-1：contracts/plugin-core/core/engine/material/plugin-sdk focused lint、typecheck、test、build 通过。
- [ ] AE-GATE-2：`pnpm check:api`、`pnpm check:boundaries`（boundary）、license、`check:packages`、`check:engine-import` 通过。
- [ ] AE-GATE-3：`pnpm verify:m0` 通过；`verify:tarball` 消费者案例通过。
- [ ] AE-GATE-4：本矩阵、tasks.md、checklist.md 与自动化证据双向同步，无未勾选适用项。

每个适用的自动化测试用例必须保持 `AE-*` 前缀标签，并与本 Spec 的 Requirements 双向映射。
