# ADR-0066：宿主拥有条件样式作者入口

> 状态：已接受
> 日期：2026-09-01
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0058](./ADR-0058-component-conditional-style-rules.md)、[ADR-0059](./ADR-0059-conditional-style-port.md)

## 背景

生产告警的阈值、优先级、确认和屏蔽规则通常来自宿主接口或统一告警平台，而不是由大屏作者在
Designer 内维护。继续提供 `styleRules` 内建编辑器会让业务规则或视觉映射出现第二个作者入口，增加
配置漂移风险。ADR-0059 已提供宿主条件样式端口，覆盖宿主拥有判定与视觉映射的主要场景。

已有文档仍可能包含 `styleRules`，宿主也可能生成随屏幕版本化的轻量状态样式映射，因此本次调整只
收回 Designer 内建作者界面，不删除文档兼容与渲染能力。

## 决策

1. Designer 不再渲染「条件样式」规则编辑区，也不处理规则增删、条件编辑或样式覆盖编辑事件。
2. `ScreenComponentNode.styleRules` 的解析、序列化、复制、`update-components` 整体替换与 Renderer
   求值保持不变；已有文档继续正常打开和渲染。
3. 宿主需要维护文档规则时，通过 canonical 文档或公开事务通道提交；运行期告警视觉优先使用
   `conditionalStylePort`。接口加载与异步业务处理仍在宿主完成，端口 `resolve` 保持同步纯函数。
4. Event Blueprint 继续负责离散交互与动作，不新增样式动作，也不作为持续条件样式的替代通道。
5. 删除仅供内建编辑器使用的 DOM、事务适配、文案、样式和测试辅助代码；保留面板回归测试，确保
   含有 `styleRules` 的组件不会重新暴露内建编辑控件。

## 非目标

- 删除或迁移 `styleRules` 公共文档契约。
- 删除 Renderer 条件样式求值或 `conditionalStylePort`。
- 改变条件操作符、合并顺序、失败关闭校验或历史语义。
- 为宿主新增网络、告警规则加载或持久化实现。

## 结果

- 告警规则与运行时视觉策略保持宿主单一事实源，Designer 属性面板不再提供重复入口。
- 既有文档零迁移，Viewer 与 Designer 画布仍按相同 Renderer 路径呈现条件样式。
- 若未来删除 `styleRules` 契约，需要另行获得兼容策略批准；本 ADR 不授权该变更。
