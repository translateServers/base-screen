# 作者面板 fixture 与缺口矩阵

> 状态：生效
> 日期：2026-08-10
> 归属：[Designer Authoring Extension Spec](../../../specs/archive/designer-authoring-extension/spec.md) Task 2

本矩阵是 Task 2 的交付：为面板 primitives 建立最小 fixture，记录 canonical target、默认值、非法输入、深度与
字节限制、预期控件，并把每个缺口归类为“可复用 primitive”或“宿主编辑器”，避免通过物料私有 UI 扩大 Engine。

## 1. fixture 总览

| fixture id | 语义 | canonical target | 默认值 | 预期控件 | 归属 |
| --- | --- | --- | --- | --- | --- |
| F1 | 标量文本 | `props.text` | `'文本'` | text | primitive |
| F2 | 标量数值（unit） | `props.value` | `0` | number/unit number | primitive |
| F3 | 枚举 | `props.align` | `'left'` | select | primitive |
| F4 | 颜色 | `style.color` | `'#ffffff'` | color | primitive |
| F5 | 嵌套 object | `props.legend.{show,position,fontSize}` | `{show:true,position:'top',fontSize:12}` | group | primitive |
| F6 | 受限数组（定长） | `props.grid.{top,right,bottom,left}` | `[20,20,20,20]` | array（每项 unit number） | primitive |
| F7 | repeatable array | `props.series[]` | `[{name:'',type:'line',yAxisIndex:0}]` | repeatable array + reorderable | primitive |
| F8 | 字段绑定选择 | `props.series[].xField` / `yField` | 空 | field selector（数据角色投影） | primitive |
| F9 | host dataset 参数 | `dataSource.params` | `{}` | host dataset 参数编辑（经既有 data 面板） | primitive（复用既有端口） |
| F10 | 结构化事件 | `blueprint.trigger.eventName` | `pointClick` | 事件列表 + capability 提示 + 宿主请求入口 | primitive（选择器）+ 宿主（编辑器） |
| F11 | 高级折叠 | `props.advanced.*` | 空 | 折叠分组（advanced: true） | primitive |
| F12 | 完整 ECharts option | 不进入 document | 无 | 宿主高级编辑器（raw JSON option） | 宿主编辑器 |
| F13 | 代码编辑（props/style/data/expression 文本） | 经 commitComponentTextEdit 提交 | 无 | 宿主代码/JSON 编辑器 | 宿主编辑器 |
| F14 | 图形 Blueprint 编辑 | 只提交 canonical Blueprint | 无 | 宿主表单/图形编辑器 | 宿主编辑器 |

## 2. 限制基线

| 限制 | 值 | 位置 |
| --- | --- | --- |
| manifest bytes | 256 KiB | plugin-core `MAX_MATERIAL_MANIFEST_BYTES` |
| schema depth | 16 层 | plugin-core `MAX_SCHEMA_DEPTH` |
| 面板字段数（property/style） | 512 | plugin-core `MAX_PROPERTY_PANEL_FIELDS` |
| Descriptor section 数（每分区） | 16 | plugin-core 新增 |
| Descriptor 字段数（每 section） | 64 | plugin-core 新增 |
| Descriptor path 深度 | 8 | plugin-core 新增 |
| condition 数（每字段） | 8 | plugin-core 新增 |
| array item 上限 | 按 schema `maxItems`（≤256） | plugin-core 新增 |
| 事件声明数 | 64 | plugin-core `MAX_EVENTS` 扩展 |
| 事件 payload schema depth | 16 | plugin-core 新增 |
| 提交 source bytes | 256 KiB | contracts authoring 限制 |
| 提交 JSON depth | 32 | contracts authoring 限制 |
| requestId 长度 | 128 | contracts authoring 限制 |

## 3. 缺口归类（已有 vs 缺口）

| 能力 | 已有 | 缺口 | 归类 |
| --- | --- | --- | --- |
| 顶层标量 prop/style | `propertyPanel`/`stylePanel`（text/number/boolean/select/color/json） | 无 | primitive（迁移 fixture） |
| 嵌套 object path | 无 | `props.a.b` 路径编辑 | primitive（group） |
| 受限数组 | schema 支持 array 但面板无数组控件 | 定长数组/每项控件 | primitive（array） |
| 重复数组 | 无 | 增删、重排、每项嵌套 | primitive（repeatable/reorderable） |
| 条件显隐 | 无 | `when` 结构化条件 | primitive（condition） |
| 帮助文本/分组/折叠 | 无 | section 分组、help、collapse、排序 | primitive |
| 稳定错误定位 | `aria-describedby` 消息 | 嵌套路径错误定位 | primitive |
| 数据绑定编辑 | 既有 data 面板 + host dataset 端口 | data descriptor 投影 | primitive（复用端口） |
| 交互配置 | interaction 面板（设计能力） | interaction descriptor → props/style/Blueprint | primitive（投影） |
| 结构化事件 | `events: string[]` | label/hint/payload schema/budget/capability | primitive（声明接入） |
| Blueprint 编辑 | Engine 内部表单（将被移除） | 宿主编辑器 + 提交桥 | 宿主编辑器 |
| 代码编辑 | `json` textarea fallback | 结构化源码编辑 | 宿主编辑器 |
| 完整 ECharts option | 无 | 高级编辑器 + 校验出口 | 宿主编辑器 |
| 领域专用配置 | 无 | 宿主领域编辑器 | 宿主编辑器 |

## 4. 面板验收矩阵（desktop/窄屏/a11y/双实例）

| case | fixture | 断言 |
| --- | --- | --- |
| M1 | 全部 | 1024x640、1440x900、1920x1080 无溢出/抖动；窄屏仅提示 |
| M2 | 全部 | forced-colors 下控件轮廓清晰；reduced-motion 无位移动画 |
| M3 | F5/F7/F11 | keyboard-only 全流程（Tab/Enter/Arrow/删除/重排）；focus 可见 |
| M4 | F5/F7 | screen reader 语义：section/fieldset/legend/aria-describedby/aria-invalid |
| M5 | F1-F11 | disabled、readonly、invalid、busy、empty、reset 六态切换无布局抖动 |
| M6 | F7/F10 | 双实例隔离：独立 requestId 与 document，提交互不影响 |

## 5. 提升规则

- 只有被至少两个独立物料使用并经过 M1-M6 的 primitive 才提升为 Engine 内建控件（记录于
  `docs/plans/designer-authoring-extension/primitive-promotion.md`，随 Task 8 产出）。
- 只能通过注入 component/function/DOM/Promise 实现的编辑需求一律归宿主编辑器，不进入提升流程。
