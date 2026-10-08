# ADR-0086: 物料状态呈现与盒面样式的单一归属

> 状态：已接受
> 日期：2026-10-03
> 关联：[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)（物料 ABI 与注册）、
> [ADR-0085](./ADR-0085-text-and-image-material-authoring.md)（文本与图片作者契约）、
> [ADR-0082](./ADR-0082-dataset-consumption-contract.md)（数据集与错误协议）、
> [ADR-0074](./ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)（外围插件依赖分区）

## 背景

7 个官方物料各自手写"数据没到位时画什么"：`base.text` 与 `base.image` 直接往宿主元素写
`textContent = '加载中'`，`base.chart` 与 `base.table` 各有一份字节相同的 `renderMessage`，
`plugin-datav-materials` 的基类再加第三份。四态里 `idle`（还没发起请求）被统一当成
「暂无数据」呈现；包内早已存在的公共 loading 视图与加载容器没有任何物料使用。

同一时期，盒面样式也有三份实现：`base.rectangle`、`base.ellipse`、`base.container` 各自拼
填充、边框、圆角、阴影，其中容器没有渐变边框分支，把渐变边框色当普通颜色写进
`border-color`，得到一条非法 CSS 声明。

这些重复本身不是美学问题。`base.table` 曾经渲染一条 `<caption>`，文字取自
`model.props.title`，而它的 `propsSchema.properties` 是空对象——这个 prop 不可能存在，于是
每次渲染都留下一条空的带内边距横条。没有集中点可以比对，这类"读了个不存在的字段"就能长期存活。

## 决策

1. **状态呈现归 `@base-screen/plugin-sdk`。** 新增 `createBaseScreenMaterialStateView`、
   `createBaseScreenMaterialErrorView`、`createBaseScreenMaterialEmptyView`；公共 loading 视图与
   loading 容器从 `@base-screen/material` 迁到 plugin-sdk，`@base-screen/material` 与
   `@base-screen/sdk/material` 继续按原名 re-export，公共名字不变。
   归属选择由依赖分区决定：外围插件只允许依赖 `contracts`、`plugin-core`、`plugin-sdk`
   （ADR-0074），chrome 放在 `material` 里插件够不到，放在 `plugin-core` 会把呈现逻辑带进契约层。
2. **四态语义钉死。** `idle` 占满同一个盒子但不给任何文案；`loading` 用共享 loading 视图；
   `error` 以 `role="alert"` 直接呈现 contracts 侧已脱敏限长的 `message`，`code` 写入
   `data-base-screen-material-error-code` 供宿主埋点读取；数据 `ready` 但形状不符合**本物料**
   契约时，由物料给出 canonical code 与领域文案（如"表格数据格式无效"），仍走同一套 chrome。
   空数据集是"查过了没有结果"，与 `idle` 分开，仍显示「暂无数据」。
3. **几何不变式。** 状态视图只在自己的子节点上写 `width/height: 100%`，绝不写宿主元素宽高，
   绝不依赖宿主 `display`（渲染器按可见性强制 `none`/`block`）。四个状态填充同一个盒子，切换时
   不产生位移；默认动画继续尊重 `prefers-reduced-motion`。
4. **盒面样式收敛为官方物料基类的一个受保护方法**，形状与容器共用同一套填充、实线边框、
   渐变边框叠加层、圆角与阴影实现。渐变边框仍用叠加层加 mask 挖空，叠加层是宿主自己的子节点。

## 后果

- 兜底文案从 4 份降到 1 份；新增物料不必再自己决定 `idle`/`error` 长什么样。
- 两处**可见行为变化**：`idle` 不再显示「暂无数据」；错误态显示 canonical 默认文案（英文）
  而不是各物料自拟的「数据不可用」。若要中文，只在状态视图一处加 `code → 文案` 映射。
- `plugin-sdk` 公共面增大（3 个函数、2 个类型），`material` 与 `sdk` 的公共名字不变。
- 不触碰 canonical 文档、Manifest 字段与物料 ABI：`type` 仍是 pattern 校验的自由字符串，
  props/style 仍由 manifest 校验，存量 Screen Document 零迁移。
