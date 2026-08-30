# Document Blueprint Host Bridge Checklist

> 状态：已完成

## 契约与投影（R1-R3）

- [x] Blueprint 请求携带严格、detached 的整屏上下文与容量限制。
- [x] 上下文覆盖完整文档、可选初始定位、在用物料事件与 capability 状态。
- [x] Blueprint 提交不再以组件身份定义范围；组件文本协议保持不变。

## 会话与边界（R4-R6）

- [x] pending 会话拒绝取消、卸载、跨实例、stale revision 和文档变化后的提交。
- [x] 合法完整 Blueprint 只形成一次 `replace-blueprint` 历史，失败零副作用。
- [x] 顶栏只发起宿主请求；组件交互页只有只读摘要和定位入口。
- [x] Engine 不含可调用的图投影、节点编辑辅助或编排 UI，生产依赖与 package 清单不变。

## 质量与交付（R6）

- [x] Contracts、Engine、DOM、public API 与 browser harness 覆盖全部核心场景。
- [x] ADR、Spec 索引、DataV 计划、能力基线与使用文档已同步。
- [x] `pnpm verify:m0` 通过，最终未勾选项审计为空。
