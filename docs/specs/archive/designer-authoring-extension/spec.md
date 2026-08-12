# 轻量 Designer 作者扩展 Spec

## Why

当前 Designer 的属性面板只支持少量顶层标量字段，无法安全表达嵌套配置、数组和条件编辑；同时，Blueprint、代码和复杂领域配置缺少稳定的宿主作者集成边界。需要在保持 Base Screen 为轻量设计器基座的前提下，建立 JSON-safe 的声明式面板与宿主作者桥，避免将重型编辑器、源码和业务会话引入 Core、Engine 或 canonical document。

## What Changes

- 增加受限、JSON-safe 的 Material Editor Descriptor，用于声明物料外观、数据、交互和事件的作者字段。
- 增加内建作者面板 primitives，用于渲染经 Descriptor 声明的通用编辑字段，并通过 Core transaction 修改 canonical document。
- 增加宿主作者桥的公开事件、方法和 detached 编辑上下文，支持组件文本和 Blueprint 的有界提交。
- 将 Blueprint 图形编辑器、代码编辑器、完整 ECharts option 编辑器和领域专用编辑器保留在宿主侧；Base Screen 只校验与原子提交 canonical candidate。
- 为官方 ECharts 物料建立渐进式语义面板试点，并仅提升已被多个物料证明可复用的控件。
- **BREAKING** 重新界定现有事件 Blueprint 作者范围：Base Screen 内部仅保留摘要、能力状态和宿主请求入口；任何取代现行 ADR-0026 或活动 Spec 授权的行为，必须先由新的已接受 ADR 明确批准。

## Impact

- Affected specs: `designer-event-blueprint`、`data-material-contracts`、`host-dataset-integration`、`designer-theme-tokens`。
- Affected code: `packages/contracts` 的 JSON-safe authoring contract、`packages/plugin-core` 与 `packages/plugin-sdk` 的 Material Manifest 契约、`packages/core` 的路径更新与 Blueprint command、`packages/engine` 的面板和 bridge、`packages/material` 的 ECharts 语义模型、`packages/sdk` 的公共 facade、`examples/browser-harness` 的宿主 shell。

## ADDED Requirements

### Requirement: Declarative Material Editor Descriptor

系统 SHALL 允许物料 Manifest 使用受限且 JSON-safe 的 Editor Descriptor，按 appearance、data、interaction 与 events 分区声明可编辑字段、canonical target、受校验 path、内建 control、条件显示和辅助文本。

#### Scenario: 受支持字段写入 canonical document

- **WHEN** 作者在 Designer 内建面板修改一个通过 Descriptor 声明的字段
- **THEN** 系统 SHALL 经由 Core transaction 将合法值原子写入对应 canonical target，并产生符合既有历史语义的记录

#### Scenario: 无效 Descriptor 失败关闭

- **WHEN** Manifest 提供未知字段、危险 path、非 JSON-safe 值、超出深度或字节限制的 Descriptor
- **THEN** 系统 SHALL 返回定位诊断，且不得注册或渲染该无效作者描述

### Requirement: Bounded Built-In Authoring Controls

系统 SHALL 仅为多个物料可复用且由 Descriptor 声明的通用编辑需求提供内建控件；控件 SHALL 支持稳定的 disabled、readonly、invalid、busy、empty 与 reset 状态，不得在状态变更时产生布局抖动。

#### Scenario: 嵌套与受限数组编辑

- **WHEN** Descriptor 声明合法嵌套 object path 或受限数组字段
- **THEN** 系统 SHALL 使用内建 group、array 或 repeatable array 控件进行编辑，并拒绝超限、非法或不匹配 schema 的候选值

#### Scenario: 复杂编辑转交宿主

- **WHEN** 一个编辑需求需要注入组件、回调、DOM、Promise、重型代码编辑器、图形编辑器或领域专用 UI
- **THEN** 系统 SHALL 不将该需求实现为 Base Screen 内建控件，并提供或使用宿主作者桥完成集成

### Requirement: Structured Event Declarations

系统 SHALL 支持结构化物料事件声明，其中包含 canonical event name、可访问显示信息、作者提示、payload schema、JSON budget、允许的 Blueprint trigger context 与必要 capability。

#### Scenario: 事件能力或 payload 无效

- **WHEN** 作者为缺少 capability 的事件创建 Blueprint trigger，或提交不符合 payload schema 和容量限制的事件数据
- **THEN** 系统 SHALL fail closed，保留 document 与 history，并返回可定位诊断

### Requirement: Host Authoring Bridge

系统 SHALL 通过公开 Custom Element method 与 CustomEvent 提供 JSON-safe 的宿主作者桥，向宿主提供 detached context，并允许宿主提交组件文本编辑或 Blueprint 编辑结果。

#### Scenario: 宿主提交有效 candidate

- **WHEN** 宿主使用当前实例发出的 requestId、匹配的 document revision、有效 component identity 和符合容量限制的 candidate 调用专用 commit method
- **THEN** 系统 SHALL 校验并原子提交 candidate，且一次成功提交最多产生一个 history entry

#### Scenario: 陈旧或跨实例提交被拒绝

- **WHEN** 宿主在 document 变化、component 删除、Designer unload/dispose、实例不匹配或 requestId 失效后提交结果
- **THEN** 系统 SHALL 拒绝提交且不得修改 document、history 或其他 Designer 实例

### Requirement: Host-Owned Heavy Editors And Source

系统 SHALL 保持 Blueprint 图形布局、代码编辑器会话、Material 源码、完整 ECharts option 编辑器、领域专用编辑器及其依赖由宿主拥有；这些内容不得进入 ScreenDocument、history、导出物或 Base Screen 默认 bundle。

#### Scenario: 宿主源码编译失败

- **WHEN** 宿主侧 Material 源码编译、类型检查或安全检查失败
- **THEN** 宿主 SHALL 保留旧 catalog 与合法 document；Base Screen SHALL 不接收源码、不执行编译且不污染当前 Designer session

### Requirement: ECharts Semantic Authoring Pilot

系统 SHALL 为官方 ECharts 物料提供由基础图表语义逐步扩展的 Descriptor 与 adapter，包括标题、图例、网格、坐标轴、series、字段绑定、颜色和基础交互；完整 option 编辑 SHALL 只作为宿主高级编辑器输入。

#### Scenario: 常见图表无需 raw option

- **WHEN** 作者配置常见折线图或柱状图
- **THEN** 系统 SHALL 允许通过受限语义字段完成配置，无需在 Base Screen 面板中暴露任意 raw option

## MODIFIED Requirements

### Requirement: Designer Event Blueprint Authoring

Base Screen SHALL 继续拥有 canonical Blueprint、严格解析、compile、trace、replace command、history、revision guard 和诊断。其内部事件面板 SHALL 仅呈现事件摘要、能力状态及 JSON-safe 宿主作者请求入口；图形 Blueprint 编辑器的布局、节点位置、搜索、MiniMap、draft 和长期 session SHALL 由宿主拥有并只提交 canonical Blueprint。

#### Scenario: 宿主 Blueprint 编辑会话失效

- **WHEN** 宿主 Blueprint 编辑器打开后发生 document replacement、组件切换、取消、关闭、reload 或 Designer dispose
- **THEN** 宿主 SHALL 使本地编辑会话失效，Base Screen SHALL 通过 requestId、revision 与实例生命周期 guard 拒绝过期提交

## REMOVED Requirements

### Requirement: Engine-Owned Graph Blueprint Authoring

**Reason**: 图形编辑器依赖重型交互会话与可选图库，属于宿主的产品与依赖决策，不属于轻量 Base Screen 基座。

**Migration**: 现有 canonical Blueprint、Core runtime 与表单作者能力保持可用；宿主通过公开作者桥实现图形编辑器，并只提交 canonical Blueprint。
