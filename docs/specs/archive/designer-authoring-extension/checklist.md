# 轻量 Designer 作者扩展验收清单

## 决策与边界

- [x] 作者桥与 Material Editor Descriptor ADR 已接受，并明确 Base Screen、宿主和 Material 的所有权。
- [x] `designer-event-blueprint` 已与新的作者桥范围同步，不再授权 Engine 内部图形编辑器。
- [x] 未新增第十三个核心 package、重型生产编辑器依赖、通用网络客户端或宿主业务降级实现。
- [x] Material Manifest、公共作者契约和宿主 bridge 均仅承载 JSON-safe 数据，不包含 component、function、DOM、Promise、服务对象、源码、凭证或任意网络配置。

## Descriptor 与面板

- [x] Editor Descriptor 的 known fields、target、path、condition、control、事件声明、深度、数组长度和字节限制均有 fail-closed parser 与定位诊断。
- [x] 未知键、危险 path、非 JSON 值、超深结构、超大 payload、错误 enum 和缺失 capability 不会修改 document 或 history。
- [x] 内建面板支持已验收的通用 scalar、nested object 与受限数组编辑，并经 Core transaction 写入唯一 canonical 状态源。
- [x] 面板在 desktop、窄屏、forced-colors、reduced-motion、keyboard-only、screen reader 与双实例场景下行为正确，状态变化不产生布局抖动。

## 宿主桥与编辑器

- [x] 宿主仅通过公共 Custom Element method、event 和 `@base-screen/*` exports 获取 detached context 与提交 candidate。
- [x] requestId、expected revision、component identity、容量、unload/dispose 和实例边界均受校验；陈旧、跨实例、无效或超限提交 fail closed。
- [x] 有效的组件文本或 Blueprint 提交最多产生一个 history entry；无效候选不修改 document、history 或其他实例。
- [x] Blueprint 图形布局、编辑器 draft、代码编辑器 session、Material 源码与完整领域配置不进入 ScreenDocument、history、导出物或 Base Screen 默认 bundle。
- [x] 宿主源码编译失败时保留旧 catalog、合法 document 与当前 Designer session，诊断仅由宿主显示。

## ECharts 与质量门

- [x] 常见折线图和柱状图可通过受限语义 Descriptor 完成基础配置，无需在 Base Screen 面板暴露任意 raw option。
- [x] 复杂 ECharts option 仅通过宿主高级编辑器输入，并在 Material schema 或 adapter 校验后提交。
- [x] Contracts、Plugin Core、Core、Engine、Material、Plugin SDK 的相关单元、DOM、browser、容量、双实例和消费者测试均通过。
- [x] API、boundary、license、bundle、tarball consumer 与 `pnpm verify:m0` 均通过，且测试矩阵、任务、清单和自动化证据保持同步。
