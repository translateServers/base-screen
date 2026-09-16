# 轻量 Designer 作者扩展实施计划

> 状态：草案，不授权实现
> 日期：2026-08-10
> 定位：在不扩大 Core/Engine 运行时职责的前提下，补齐物料属性面板、宿主编辑器、事件 Blueprint 和复杂图表作者能力
> 权威边界：[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)
> 相关：[Material Contract](../../../specs/archive/data-material-contracts/spec.md)、[Host Dataset Integration](../../../specs/archive/host-dataset-integration/spec.md)、[Designer Event Blueprint](../../../specs/archive/designer-event-blueprint/spec.md)、ADR-0026

本计划不是新增完整 Designer 产品的路线，也不是把 Monaco、CodeMirror、图形图库或业务编辑器塞进 Base Screen。
目标是建立一条稳定的作者扩展边界：Base Screen 拥有 canonical 数据、纯校验、Core command、基础面板 primitives
和结果投影；宿主拥有重型编辑器、业务工作流、源代码编译和长生命周期编辑会话。

## 1. 目标与非目标

### 1.1 目标

- 物料作者可以通过 JSON-safe、声明式的 Manifest 描述外观、数据、交互和事件作者字段。
- Base Screen 使用有限的内建控件渲染常规属性面板，并把修改统一提交到 canonical document。
- 宿主可以在 Designer 外部接入图形 Blueprint 编辑器、代码编辑器和复杂领域配置编辑器。
- 外部编辑器只能读 detached snapshot、提交 canonical candidate，不能访问 Shadow DOM、内部 Store 或任意回调。
- ECharts 作为第一个复杂物料案例，验证分组、重复数组、字段绑定、条件字段、高级配置和错误反馈。
- 所有新增公共契约都具备 parser、大小限制、fail-closed 诊断、revision guard、双实例和 tarball consumer 证据。

### 1.2 非目标

- 不在 `@base-screen/core`、`@base-screen/engine` 或 `@base-screen/sdk` 中引入代码编辑器、图形编辑器或专用图表配置器。
- 不允许物料 Manifest 携带 React/Vue component、render function、formatter function、DOM Node、Promise 或宿主服务对象。
- 不把 JavaScript/TypeScript/HTML/CSS 源码写入 `ScreenDocument`，不增加 `eval`、脚本字段或任意网络配置。
- 不把 ECharts option 的所有字段一次性映射为 Designer 内建表单；先覆盖稳定、可复用的语义子集。
- 不新增第十三个核心 package。若未来多个宿主需要复用重型编辑器，单独评估可选包或独立仓库。
- 不建设项目中心、资产后台、发布部署中心、截图/视频/批量导出或后台任务队列。

## 2. 当前基线与缺口

### 2.1 已有能力

| 范围 | 当前能力 | 所有权判断 |
| --- | --- | --- |
| 外观 | `propsSchema`、`propertyPanel`、`styleSchema`、`stylePanel`，支持 text/number/boolean/select/color/json | 方向正确，但只覆盖标量和顶层字段 |
| 数据 | static/host-resource、dataset catalog、变量端口、字段绑定角色、表格/图表适配器 | 方向正确，继续由宿主执行真实数据处理 |
| 交互 | resize/rotate/children capability，交互面板展示能力 | 只覆盖设计器能力，没有通用交互配置字段模型 |
| 事件 | Manifest `events` 字符串列表、Blueprint trigger、host action capability | 有运行时基础，缺少结构化 payload/editor descriptor |
| 文档编辑 | `getDocument()`、`replaceDocument()`、`executeCommand()`、`base-screen-change`、`base-screen-selection-change` | 可作为桥接基础，但需要面向宿主编辑器的专用 facade |
| 宿主边界 | Project、resource、dataset、variable、asset、action ports，均有 capability 校验 | 端口方向正确，部分 Engine UI 仍承载宿主产品工作流 |

### 2.2 关键缺口

1. 当前字段只能用单个顶层 `prop`/`style` 定位，不能表达嵌套路径、重复数组、可重排列表和条件显示。
2. 面板控件与 canonical target 绑定较紧，尚未统一表达 props、style、data binding、interaction 和 Blueprint 的编辑目标。
3. `events` 只有事件名，没有 label、payload schema、事件上下文和作者提示。
4. Blueprint 和代码编辑器没有稳定的外部编辑上下文、提交方法和过期 revision 处理协议。
5. ECharts 的配置同时涉及数据、系列、坐标轴、外观、交互和事件，直接暴露完整 option 会造成面板不可用和文档失控。

## 3. 目标架构

```text
Host shell
├── <base-screen-designer>
├── Host Blueprint Editor
├── Host Code Editor
└── Host Domain Editor
        │ JSON-safe request / commit
        ▼
Base Screen Authoring Bridge
├── detached editor context
├── requestId / documentRevision / byte limits
├── Contracts parser and diagnostics
├── Core compile / transaction / history
└── built-in declarative panel primitives
        │
        ├── Material Manifest + Editor Descriptor
        ├── ScreenDocument / ScreenBlueprint
        └── Host ports: data / asset / action / project
```

### 3.1 包职责

| 包 | 允许增加的内容 | 明确禁止 |
| --- | --- | --- |
| `contracts` | canonical editor request/result、Blueprint、JSON-safe limits、诊断 | 面板 DOM、编辑器依赖、宿主对象 |
| `plugin-core` | Material Editor Descriptor、控件 schema、事件声明、Manifest parser | React/Vue renderer、动态 callback |
| `core` | 纯路径更新、结构校验、Blueprint compile/trace、原子 command | DOM、网络、编辑器状态、宿主业务逻辑 |
| `engine` | 内建面板 primitives、作者桥适配、revision guard、结果投影 | Monaco/CodeMirror/图库、物料私有 UI、宿主工作流 |
| `material` | 官方 ECharts 语义模型、Manifest、adapter、conformance fixture | 把 ECharts 专用面板规则写入 Core |
| `sdk` | 稳定 facade 和类型转发 | 新的领域运行时或编辑器实现 |
| 宿主/示例 | 重型编辑器、源码编译、业务面板、长任务和实际端口实现 | 依赖 `packages/*/src` 内部实现 |

## 4. 作者契约设计

以下是候选契约，必须先通过 ADR 和 Spec，不能直接按示例冻结公共 API。

### 4.1 Material Editor Descriptor

物料 Manifest 增加一个可选的声明式作者描述，按语义区域组织字段：

```ts
interface BaseScreenMaterialEditorDescriptor {
  readonly appearance?: readonly BaseScreenMaterialEditorSection[];
  readonly data?: readonly BaseScreenMaterialEditorSection[];
  readonly interaction?: readonly BaseScreenMaterialEditorSection[];
  readonly events?: readonly BaseScreenMaterialEventDescriptor[];
}

interface BaseScreenMaterialEditorField {
  readonly id: string;
  readonly target: 'props' | 'style' | 'data' | 'interaction';
  readonly path: readonly string[];
  readonly label: string;
  readonly control: BaseScreenMaterialEditorControl;
  readonly when?: BaseScreenMaterialEditorCondition;
  readonly advanced?: boolean;
}
```

约束：

- `path` 是经过 schema 校验的 canonical 路径，不是任意 document pointer。
- `target: interaction` 必须明确映射到已有 props/style/Blueprint 语义，不创建无法解释的第二份状态。
- `when` 只允许有限的结构化比较、存在性和枚举条件，不允许表达式脚本或函数。
- 所有 label、help、option、default 和 validation 都必须是 JSON-safe 数据。
- 字段、section、array item、condition、schema depth、manifest bytes 都有上限。
- Editor Descriptor 只描述“编辑什么”和“使用哪种内建控件”，不描述“如何渲染 DOM”。

### 4.2 控件 primitives

按风险逐步增加，不一次性建设完整表单框架：

1. 已有 scalar：text、number、boolean、enum、color、json。
2. 结构化 group：object、array、repeatable array、reorderable array、key-value map。
3. 领域通用控件：field selector、asset selector、color stop、range、unit number、preset selector。
4. 高级入口：受 schema 限制的 JSON/text editor；真正的代码编辑器仍在宿主。

每个新控件必须至少有一个真实物料用例、Manifest parser 测试、DOM 键盘测试、无效输入测试、双实例测试和移除路径。
只有同一控件被多个物料独立需要时，才提升到 Engine 内建 primitives。

### 4.3 结构化事件声明

把当前 `events: readonly string[]` 扩展为结构化事件声明时，至少支持：

- canonical event name。
- 可访问显示名称和作者提示。
- payload schema 和 JSON budget。
- 允许的 Blueprint trigger context。
- 是否需要某个已授权 capability。

Blueprint action 仍只使用 canonical `set-variable`、`emit-host-event` 和 `host-action` 语义；物料不得通过 Manifest 注入私有 action executor。

## 5. 宿主作者桥

### 5.1 读取上下文

宿主编辑器可以通过公开事件和方法取得：

- 当前 selected/focused component id。
- detached component snapshot、Manifest 和 Editor Descriptor。
- 当前 Blueprint、事件列表、runtime capability snapshot。
- document opaque revision 和当前编辑限制。

上下文必须是 detached JSON，不能包含 DOM、class instance、port、function 或内部 controller 引用。

### 5.2 发起编辑

宿主可以在自己的 shell 中放置按钮和面板。若需要由 Base Screen 的公共面板触发，增加 JSON-safe 的 authoring request event：

```ts
type ScreenAuthoringRequest =
  | {
      readonly kind: 'component-text';
      readonly requestId: string;
      readonly componentId: string;
      readonly documentRevision: string | null;
      readonly target: 'props' | 'style' | 'data';
      readonly source: string;
      readonly language: 'json' | 'expression';
      readonly maxBytes: number;
    }
  | {
      readonly kind: 'blueprint';
      readonly requestId: string;
      readonly componentId: string;
      readonly documentRevision: string | null;
      readonly blueprint: ScreenJsonObject;
      readonly maxBytes: number;
    };
```

这个 event 只传递请求，不等待编辑器 UI 的 Promise。宿主编辑器可以打开数分钟，随后通过专用 commit method 返回结果。

### 5.3 提交编辑

建议提供用途明确的提交入口，而不是让宿主长期依赖通用 `executeCommand()`：

- `commitComponentTextEdit({ requestId, expectedRevision, componentId, target, source })`。
- `commitBlueprintEdit({ requestId, expectedRevision, componentId, blueprint })`。

两者都返回 `ScreenParseResult<ScreenDocument>`，失败不修改 document/history；成功最多产生一个 history entry。提交时必须检查：

- requestId 是否仍属于当前 Designer 实例。
- document revision 是否仍匹配。
- componentId、target、path 和 schema 是否仍有效。
- source、payload、Blueprint 和 detached result 是否在容量限制内。
- Designer 是否已经 unload/dispose。

### 5.4 代码编辑器的特殊边界

编辑组件源代码时，宿主不调用 `commitComponentTextEdit` 写入 Screen Document。宿主负责：

1. 读取源码并在宿主侧编译、类型检查和安全检查。
2. 生成符合 Material ABI 的 constructor、static Manifest 和 catalog entry。
3. 在独立 preview realm 或宿主预览环境中处理热更新，避免重复定义同一个 Custom Element。
4. 编译成功后让 Designer `unload()`，重新绑定 catalog，再加载当前文档。
5. 编译失败时保留旧 material 和旧 document，只把诊断显示在宿主编辑器。

## 6. 小步实施切片

### Slice 0：冻结决策与范围

交付：

- 新增“宿主作者桥与 Material Editor Descriptor”ADR，明确不注入 UI、不注入源代码、不新增重型 editor package。
- 重新评估 ADR-0026：保留 Core Blueprint contract/runtime，取代 Engine 内部作者 UI 的部分。
- 将当前 `designer-event-blueprint` 活动 Spec 拆为“Base runtime/contract”和“Host authoring bridge”两个职责，或归档其不再适用的作者任务。
- 在 Designer Full Product 归档范围上补充：ECharts、Blueprint editor、code editor 均是宿主集成能力。

退出条件：没有任何实现任务在 ADR/Spec 未明确前开始；所有新字段都有唯一所有者。

### Slice 1：建立作者面板 fixture 和缺口矩阵

交付：

- 建立 text、number、enum、color、nested object、array、host dataset、material event 的最小 fixture。
- 为每个 fixture 记录 canonical target、默认值、非法输入、最大深度、最大 bytes 和预计 UI 形态。
- 建立 desktop、窄屏、forced-colors、reduced-motion、keyboard、双实例的面板验收矩阵。
- 先用当前 `propertyPanel/stylePanel/dataBinding/events` 测试能覆盖什么，不能覆盖什么，不凭感觉扩展 schema。

退出条件：至少有一个普通物料和一个图表物料的完整面板矩阵，所有缺口都归类为“通用 primitive”或“宿主编辑器”。

### Slice 2：作者 Descriptor 的 Contracts/Plugin Core 基础

交付：

- 在 `plugin-core` 冻结 Editor Descriptor 的 JSON shape、known fields、parser、limits 和 diagnostics。
- 在 `plugin-sdk` 提供纯数据 builder/validator，不提供 DOM renderer。
- 把 section、field、target、path、condition 和 scalar controls 接入一个官方文本/矩形 fixture。
- 证明未知字段、危险 path、循环/非 JSON 值、超深 schema、超大 descriptor 和错误 enum 均 fail closed。

退出条件：Manifest conformance、round-trip、schema golden、API report 和 tarball consumer 通过；Engine 尚不支持复杂控件。

### Slice 3：基础面板 UX 和嵌套路径

交付：

- Engine 增加 section、分组、折叠、排序、帮助文本、条件显隐和稳定错误位置。
- 增加嵌套 object path 和受限 array 编辑，所有写入经过 Core transaction。
- 保留已有标量控件作为迁移 fixture；不增加第三方 UI 库。
- 统一 disabled、readonly、invalid、busy、empty 和 reset 状态，确保状态变化不产生 layout shift。

退出条件：普通物料、双实例、键盘-only、屏幕阅读器语义、窄屏提示和 Chromium 截图矩阵通过。

### Slice 4：数据、交互和事件声明

交付：

- 数据 descriptor 只声明字段/角色/参数编辑意图；真实目录、变量和数据仍通过既有 host ports。
- interaction descriptor 只投影到已有 props/style/design capability/Blueprint，不创建第二状态源。
- 结构化 event descriptor 接入事件列表、payload schema、能力提示和 Blueprint trigger 选择器。
- 事件 payload 的错误、过大、未知路径和 capability 缺失都在 Base Screen 内 fail closed。

退出条件：一个静态物料、一个 host dataset 物料和一个带三类事件的物料通过 contracts/core/DOM/browser 案例。

### Slice 5：宿主作者桥基础

交付：

- 在 `contracts` 定义 authoring request/context/result 的 JSON-safe 类型和限制。
- 在 `engine` 增加 requestId、document revision、unload/dispose 和 stale commit guard。
- 增加 component text edit 和 Blueprint commit 两个用途明确的公开入口。
- 提供 host shell harness：宿主侧面板位于 Shadow DOM 外，读取 selection，提交 valid/invalid/stale candidate。

退出条件：宿主无需访问私有源码即可完成一次组件字段编辑和一次 Blueprint 替换；提交成功只有一个 history entry。

### Slice 6：宿主事件 Blueprint 编辑器

交付：

- Base 内部事件面板退化为事件摘要、能力状态和宿主编辑请求入口。
- 宿主实现表单或图形 Blueprint editor，布局、节点位置、MiniMap、搜索和 draft 全部留在宿主 session。
- 宿主只提交 canonical Blueprint；Base 负责 parse、compile、trace、replace command 和诊断。
- host-action 只提交已授权 action id 与 JSON payload，真实执行仍走 `ScreenBlueprintHostActionPort`。
- 为 editor 打开后文档变化、切换组件、取消、关闭、reload 和 dispose 建立 session invalidation 规则。

退出条件：宿主 editor 不引入 Engine 生产依赖；Base/Viewer 仍能独立消费同一 canonical Blueprint；图形布局不进入 document/history/export。

### Slice 7：宿主结构化代码编辑器

交付：

- 宿主代码编辑器先支持 `props`、`style`、data parameter 和受限 expression 的 JSON/text 编辑。
- Base 只接收 source snapshot，按 target schema 解析并转换为 Core transaction。
- 增加 source bytes、JSON depth、expression complexity、未知字段和 stale revision 的诊断。
- `json` 控件保留为无外部编辑器时的 fallback，不强制安装 Monaco/CodeMirror。

退出条件：普通 JSON 编辑、非法文本、并发编辑、取消和恢复均可验证；任意 executable source 仍不会进入 Screen Document。

### Slice 8：宿主组件源码编辑与 Material 重新装配

交付：

- 宿主建立 source -> compile -> Material constructor/Manifest/catalog 的独立 pipeline。
- Base 只通过 catalog 消费编译结果，不读取源码、不执行宿主编译器、不保留 source。
- 处理 CustomElementRegistry 不能重复定义的问题：开发预览使用 host-owned realm 或稳定 wrapper，不修改公共 tagName 规则。
- 编译失败不破坏当前 catalog、document、history 和 Designer session。

退出条件：编译成功可重新加载 material 并保留合法 document；编译失败只产生宿主诊断，不污染 Base runtime。

### Slice 9：ECharts 语义面板试点

交付顺序：

1. 先支持标题、图例、网格、坐标轴基础字段和单一 series。
2. 增加 repeatable series、series type、名称、字段绑定、颜色和基础数值配置。
3. 增加多轴/条件字段/高级折叠/预设，但保持每一项都有明确 schema 和容量限制。
4. 增加 tooltip、hover、select、click 等交互配置，交互配置写入 props 或 Blueprint，不写入私有运行态。
5. 增加宿主 advanced editor：完整 option 的 JSON 只作为宿主编辑器输入，提交前由 Material schema/adapter 校验。
6. 增加表格与图表共用的 field selector、array editor、color 和 unit number primitives，验证是否值得提升为通用控件。

退出条件：常见折线/柱状图配置无需 raw option 即可完成；复杂 option 有明确的宿主出口；大配置不会导致面板卡顿、溢出或布局抖动。

### Slice 10：收敛、验证与发布门

交付：

- 完成 contracts/plugin-core/core/engine/material/plugin-sdk 的 API、boundary、license、consumer bundle 和 tarball 检查。
- browser 覆盖宿主面板、Blueprint editor、结构化 code editor、ECharts 复杂面板和双实例。
- 在 `examples/browser-harness` 增加最小 host shell；不要把示例内部实现提升为公共 API。
- 用真实生产包验证宿主只从 exports 消费公开类型，不读取 `src`、私有 DOM 或内部 fixture。
- 所有需求在测试矩阵中双向映射；没有自动化证据的能力不得勾选完成。

退出条件：受影响包和最终 `pnpm verify:m0` 通过，且没有新增重型生产依赖或固定包图外的实现。

## 7. 测试矩阵

### Contracts/Plugin Core

- descriptor known fields、nested path、target、condition、control union、event payload schema。
- unknown key、危险 path、非 JSON 值、schema depth、array length、manifest bytes、payload bytes。
- material static Manifest 与 runtime constructor/descriptor 一致性。

### Core

- scalar/nested/array/path edit 的纯转换。
- invalid candidate 原子失败，document/history 保持不变。
- Blueprint compile/trace/dispatch 等价，capability 缺失 fail closed。
- expected revision 不匹配、component 删除、document replace 和 undo/redo。

### Engine DOM/Browser

- section/field/array/map/json 控件的 keyboard、focus、disabled、invalid、busy 和 reset。
- selection change -> host editor request -> commit -> single history entry。
- host editor cancel、stale result、unload、disconnect、双实例隔离。
- ECharts 大量 series、窄屏、forced-colors、reduced-motion、长文本、错误路径和滚动稳定性。

### Host consumer

- 只从 `@base-screen/*` exports 导入。
- host Blueprint editor 和 code editor 不进入 Base Screen bundle。
- 编译失败、host port 超时、host 取消、catalog reload 和旧 material 保留。
- tarball 中不存在 editor dependency、source code persistence 或私有路径引用。

## 8. 风险与应对

| 风险 | 应对 |
| --- | --- |
| Descriptor 变成小型低代码平台 | 只增加被多个物料证明复用的 primitives；每个控件设上限和移除路径 |
| ECharts 语义泄漏到 Core | ECharts 只拥有 Material Manifest、adapter 和 fixture；Core 只处理通用 JSON/command |
| 宿主编辑器提交旧数据 | requestId、expected revision、component identity、unload generation 全部校验 |
| 高级 JSON 变成任意脚本入口 | strict parser、forbidden key、无 function、无 eval、无 URL/header/token/SQL |
| 多个宿主重复建设编辑器 | 先宿主内实现；出现第二个真实复用方再评估独立可选包 |
| 面板 UX 不稳定 | 先 fixture 和浏览器矩阵，再扩大 descriptor；固定 section/field 几何并预留滚动轨道 |
| Custom Element 热更新失败 | 宿主使用独立 realm 或稳定 wrapper；Base 不尝试重新 define 同 tagName |

## 9. 终止与回退规则

- 如果某个控件只能通过注入 React/Vue component 才能实现，则停止把它加入 Base Screen，转为宿主外部编辑器。
- 如果 ECharts 语义需要大量专用分支，则保留最小语义面，完整 option editor 留在宿主。
- 如果 Blueprint editor 需要图形库才能交付，则图形库只进入宿主，不调整 Core/Engine 依赖白名单。
- 如果源代码编辑需要改变 canonical document 或 Material ABI，则停止并新增 ADR，不在当前切片中绕过边界。
- 任一 slice 的边界、公共字段或包图发生变化时，先停在决策门，不把实现结果反向当成契约。

## 10. 总体验收

本计划完成的定义不是“Designer 拥有所有编辑器”，而是：

- 常规物料属性可以用声明式 descriptor 和内建 primitives 完成。
- 复杂 Blueprint、代码和领域配置可以由宿主编辑器完成，并通过稳定 JSON-safe bridge 提交。
- Base Screen 始终是 canonical document、纯校验/编译、原子历史和渲染基座。
- 宿主始终拥有重型 UI、源码、业务状态、真实执行和长任务。
- Base Screen 默认 bundle 不包含图形编辑器、代码编辑器或 ECharts 专用配置器。
- 所有适用 Spec、checklist、test matrix 和质量门均有当前代码与自动化证据。
