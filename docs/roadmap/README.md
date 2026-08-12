# Base Screen 后续路线图

> 状态：方向候选，不授权实现
> 最近更新：2026-08-12（阶段封版）

本路线图列出下一阶段的候选方向与触发条件。**它不授权任何实现**：每一项启动前都必须先有已接受的 ADR
与生效中的 Spec，并登记到 [Spec 索引](../specs/README.md) 的“生效中”区域。当前无生效中 Spec。

## 候选方向

| 方向 | 说明 | 前置/触发条件 | 相关归档材料 |
| --- | --- | --- | --- |
| 宿主侧项目/数据/发布能力 | 项目持久化、数据查询/聚合、资产存储、发布部署与长任务，按轻量基座边界归宿主实现 | 宿主侧立项，有明确业务容量 | [ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) |
| Blueprint 图形编辑器 | 事件 Blueprint 的图形布局/代码编辑器归宿主，Base Screen 只提供 detached 编辑上下文与有界提交 | 宿主立项图形编辑器；`@dagrejs/dagre` 等布局候选仅在该需求生效时进入试点 | [Designer Event Blueprint](../specs/archive/designer-event-blueprint/spec.md)、[依赖评估](../plans/archive/designer-event-blueprint/dependency-evaluation.md) |
| 条件候选依赖试点 | `@floating-ui/dom`（碰撞感知 anchored overlay）、`@tanstack/virtual-core`（大图层树滚动缺口） | 对应需求成为生效中 Requirement 且出现可复现性能/正确性缺口 | [依赖评估](../plans/archive/designer-dependency-introduction/dependency-evaluation.md) |
| 复杂数据绑定（数据包） | 组件绑定复杂数据是否引入“数据包”概念，尚未决策 | 先完成评审并形成结论 | [数据绑定调研](../plans/数据绑定与数据包调研.md) |
| 在线物料 MCP 扩展 | 在线物料查询/校验 MCP 的生产服务与运行包归宿主 | 宿主立项在线服务 | [ADR-0030](../decisions/ADR-0030-host-material-mcp-access.md)、[Host Material MCP Access](../specs/archive/host-material-mcp-access/spec.md) |
| 历史主线补完 | Designer Full Product 中被轻量基座取代的完整产品范围（项目/资产/发布/多用户） | 仅在宿主边界外出现明确需求时按新增量 Spec 重启 | [Designer Full Product](../specs/archive/designer-full-product/spec.md) |

## 约束提醒

- 新增功能若能通过既有宿主边界完成，不得新增 Base Screen 内部工作流、package 或传输配置（见 [ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)）。
- 范围扩展必须先更新 ADR 与生效中的 Spec；探索阶段禁止引入版本化命名（`V1/V2`、`apiVersion` 等）。
