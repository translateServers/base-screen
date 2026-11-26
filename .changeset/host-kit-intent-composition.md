---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 的意图层编译器输出「外壳 + 原子物料」的组合（ADR-0113 S4）：

- 一张指标卡、一个块各编成一个外壳（目录里声明了 `children` 的容器物料）加上它的底板、标题、说明、主体；外壳是整体移动、复制、删除的把手，图层里是一个可折叠的组。子组件的 `parentId` 指向外壳，位置仍是画布绝对坐标。
- 目录形状 `IntentCatalogMaterial` 增加可选的 `children`。外壳是编译器的组合手段：解析会拒绝把它当块类型，底板挑选也会排除它。
- 目录里没有可用外壳时退回平铺，并在产物的告警里写 `INTENT_SHELL_UNAVAILABLE`，不静默降级。
- 组件 id 不变：外壳占该来源的第 0 个，其后是底板与文字（`agent-kpi-0-0` 是外壳，`agent-kpi-0-1` 是底板）；流式落稿时外壳与底板先到、内容后补，已有组件的 id 与几何不变。
