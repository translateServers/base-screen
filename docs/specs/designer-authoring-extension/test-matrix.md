# Designer Authoring Extension 测试矩阵

> 状态：生效中
> 依据：[spec.md](./spec.md)、[tasks.md](./tasks.md)、[checklist.md](./checklist.md)

## Contracts / Plugin Core / Plugin SDK

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-DC-C01 | Declarative Material Editor Descriptor | plugin-core | editor-descriptor.test.ts（AE-DC-C01）section/field/target/path/condition/control 白名单、必填与 round-trip；官方物料 Descriptor fixture 解析 |
| AE-DC-C02 | Descriptor 失败关闭 | plugin-core | editor-descriptor.test.ts（AE-DC-C02）未知键、危险 path、非 JSON 值、循环、超深 schema、超深/超大 payload、错误 enum、重复 id 均返回定位诊断且不注册 |
| AE-DC-C03 | 容量限制 | plugin-core | editor-descriptor.test.ts（AE-DC-C03）字段数、section 数、array item、condition 数、schema depth、manifest bytes、事件声明上限与定位诊断 |
| AE-DC-C04 | Structured Event Declarations | plugin-core | editor-descriptor.test.ts（AE-DC-C04）canonical event name、label/hint、payload schema、JSON budget、trigger context、capability 的解析与错误路径 |
| AE-DC-C05 | schema golden / API / consumer | Package | contracts 与 plugin-core 的 schema golden 未漂移；API report 含新类型；tarball consumer 可导入 Descriptor 类型与 parser（check:api、verify:tarball） |
| AE-DC-C06 | builder/validator | plugin-sdk | plugin-sdk editor-descriptor.test.ts（AE-DC-C06）纯数据 builder 生成合法 Descriptor；错误输入返回定位诊断；官方物料经 createMaterialDefinition 通过 |

## Core

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-CR-C01 | canonical 路径写入 | Core | core tests/json/path-update.test.ts（AE-CR-C01）标量/嵌套/array/repeatable 纯转换与原子失败 |
| AE-CR-C02 | Blueprint 提交 | Core | core tests/commands/apply.test.ts（AE-CR-C02）compile-then-`replace-blueprint` 单命令；authoring-bridge 期望 revision/组件删除/undo-redo |
| AE-CR-C03 | trace/dispatch 等价 | Core | core tests/blueprint/trace.test.ts（EB-R7-C01/C02）同一内核逐字段等价（见 designer-event-blueprint 矩阵 EB-R7-C01/C02） |

## Engine DOM / Browser

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-ED-C01 | 面板 primitives | Engine DOM | designer-descriptor-dom.ts 的 section/分组/折叠/帮助/条件显隐 DOM；verify-browser-harness ECharts sections/advanced 折叠断言 |
| AE-ED-C02 | 控件状态 | Engine DOM | designer-panel-dom.test.ts 非法输入拒绝；verify-browser-harness aria-invalid/disabled 断言（六态 CSS 见 designer-controls.css） |
| AE-ED-C03 | 嵌套与受限数组 | Engine DOM | designer-descriptor-operations.test.ts（AE-ED-C03）nested path/array/repeatable/reorderable 经 Core transaction 写入 |
| AE-ED-C04 | 数据/交互投影 | Engine DOM | designer-descriptor-operations.test.ts 数据参数/绑定写入；verify-browser-harness 数据 tab 字段选择器断言 |
| AE-ED-C05 | 结构化事件接入 | Engine DOM | designer-blueprint-dom.test.ts / designer-integration-controller.test.ts（EB-R7-C03）；verify-browser-harness 事件 tab label/能力断言 |
| AE-ED-C06 | 内部事件面板收敛 | Engine DOM | designer-integration-controller.test.ts（AE-ED-C06）；verify-browser-harness 内部 surface 断言 |
| AE-ED-C07 | 宿主作者桥 | Engine DOM/browser | designer-authoring-bridge.test.ts（AE-ED-C07）；verify-browser-harness blueprint/text commit 闭环 |
| AE-ED-C08 | 文本编辑诊断 | Engine DOM | designer-authoring-bridge.test.ts（AE-ED-C08）source bytes/depth/未知字段/stale revision |
| AE-ED-C09 | 双实例与清理 | Engine browser | verify-browser-harness 双实例 smoke（AE-ED-C09 标签）；authoring-bridge.test.ts 实例生命周期 |
| AE-ED-C10 | 视觉矩阵 | Chromium | verify-browser-harness 1024x640/1440x900/1920x1080/390x844 视口截图；check-designer-styles 样式门禁 |

## ECharts 语义试点

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-EC-C01 | 基础语义配置 | material/Engine DOM | material echarts.test.ts（AE-EC-C01）；verify-browser-harness ECharts sections/字段/数组断言 |
| AE-EC-C02 | 交互写入 | material/Engine DOM | echarts.test.ts（AE-EC-C02）字段投影与 raw option 隔离；verify-browser-harness field selector |
| AE-EC-C03 | 高级折叠与多轴 | material | echarts.test.ts（AE-EC-C03）多轴/条件字段/高级折叠 schema 与容量；verify-browser-harness advanced 折叠断言 |
| AE-EC-C04 | 跨物料复用评估 | material/Engine DOM | [primitive-promotion.md](../plans/designer-authoring-extension/primitive-promotion.md) 记录 field selector/array/color/unit-number 使用矩阵与提升判定 |

## 宿主消费方

| Case | Requirement | 阶段 | 主要证据 |
| --- | --- | --- | --- |
| AE-HB-C01 | 公共 exports 集成 | harness/consumer | verify-browser-harness 宿主 shell（Shadow DOM 外）经公开 method/event 取 detached context 并提交；authoring-bridge 单元测试 |
| AE-HB-C02 | bundle 卫生 | Package | check:engine-import、verify:tarball（publint/ATTW）、默认 bundle 无编辑器依赖 |
| AE-HB-C03 | 源码编译失败 | harness | harness/示例文档化宿主编译失败路径（保留旧 catalog 与 document，诊断仅宿主显示） |
| AE-HB-C04 | 容量与陈旧提交 | harness | verify-browser-harness stale revision/无效提交断言；authoring-bridge.test.ts 容量与实例边界 |

## 质量门

- [x] AE-GATE-1：contracts/plugin-core/core/engine/material/plugin-sdk focused lint、typecheck、test、build 通过。
- [x] AE-GATE-2：`pnpm check:api`、`pnpm check:boundaries`（boundary）、license、`check:packages`、`check:engine-import` 通过。
- [x] AE-GATE-3：`pnpm verify:m0` 通过；`verify:tarball` 消费者案例通过。
- [x] AE-GATE-4：本矩阵、tasks.md、checklist.md 与自动化证据双向同步，无未勾选适用项。

每个适用的自动化测试用例必须保持 `AE-*` 前缀标签，并与本 Spec 的 Requirements 双向映射。
