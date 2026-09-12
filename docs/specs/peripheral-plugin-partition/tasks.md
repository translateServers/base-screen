# Peripheral Plugin Partition Tasks

> 状态：生效中
> 最近更新：2026-09-12
> 依据：[spec.md](./spec.md)

## P0 承载骨架

- [x] `pnpm-workspace.yaml` 新增 `plugins/*`（R1）
- [x] `check-boundaries.mjs` 分区重写，`packages/` 区行为逐字不变（R1、R2）
- [x] 新增 `PLUGIN_DEPENDENCY_FORBIDDEN`、`FORBIDDEN_PLUGIN_WORKSPACE_DEPENDENCY`、`FORBIDDEN_PLUGIN_EXTERNAL_DEPENDENCY`、`PLUGIN_RELATIVE_IMPORT_ESCAPE` 四类失败关闭（R2、R3、R4、R5）
- [x] 首个外围插件 `plugins/plugin-echarts`，依赖 `echarts` 并显式登记（R4）
- [x] 插件内私有 adapter 收口第三方类型，公共导出面保持 JSON-safe（R6）
- [x] 插件 runtime 入口 DOM-free，元素注册独立成模块（R7）
- [x] 插件 tsconfig 局部 `skipLibCheck`，核心库严格度不受影响（R6）
- [x] `base.echarts` 从 `packages/material` 整体移除（R8）
- [x] Editor Descriptor 载体以 `harness.semantic-chart` 迁入 `examples/browser-harness`（R8）
- [x] Engine 承载面接入 catalog、command port、panels、inspector controls 与运行时贡献索引（R9）
- [x] 更新 ADR-0074 决策 8 与架构评审记录，登记实际处置（R8）
- [x] 静态门禁全绿：`check:docs`、`check:boundaries`、`check:packages`、`check:api`、`format:check`、`lint`

## 环境待办（阻塞后续验收）

- [x] 在普通 shell 执行 `pnpm install`，使 `plugins/plugin-echarts` 可经 pnpm 构建与测试
- [x] 执行 `pnpm verify:browser`，验证 harness 侧 `harness.semantic-chart` 与原 `base.echarts` 断言等价
- [x] 执行全量 `pnpm verify:m0`

## 后续阶段

- [x] 声明与接线收敛：六类贡献点的声明形态与 Engine 接线对齐——`createPluginRegistration` 把 custom element 注册与 manager 输入组装收敛为一次调用（冲突预检先于第一个 define，幂等重放放行）；`createCommandPort` 选项真正可选，缺键与显式 undefined 同义
- [x] `dataResourceType` 的 Engine 侧承载接线（R9）：贡献索引支持枚举，数据面板渲染授权类型选择器（无枚举时回退文本输入）；`dataResourceType` id 收敛到文档 `resourceType` 命名模式；渲染器补 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN` 回归测试
- [x] 失败爆炸半径收敛：单个插件失败不影响其他插件与核心库目录——可归因到单插件的预检失败（清单解析、能力授权、registry 解析、跨插件冲突的 first-wins 后声明方）只排除该插件并级联其依赖方；运行期 `activate` 失败同样只失效自身会话；快照新增 `failures` 记录，宿主自营物料解析失败仍为全局门
- [x] 懒激活：按贡献点实际使用时机激活，避免启动期全量激活——manager 新增 `activation: lazy` 模式与 `ensureActive` 显式触发：预检与目录发布保持一次完成（授权不放松），插件 activate 钩子推迟到其贡献命令/面板动作首次经 manager 使用或显式 ensureActive 时按拓扑序运行；懒激活失败记入 snapshot.failures 并拒绝重试
- [ ] UI 与命令承载面采纳：把既有内建面板与命令逐步外包给插件通道
- [x] 条件内核表驱动：以数据表替换条件分支堆积——resolver 的能力判定收敛为声明表`PLUGIN_CAPABILITY_DESCRIPTORS`（id + port 工厂要求 + blueprint 标记），能力授权、端口兼容性与 blueprintCapability 贡献校验都查同一张表，新增能力只改一处；贡献判别联合的类型化 switch 按评审 P5 的触发条件保持门控（出现第 7 类贡献时再表驱动化）
- [ ] 兼容性设计（需用户明确批准后启动）

## 收尾

- [ ] 全部任务完成后，同一批次移入 `docs/specs/archive/` 并更新索引、Baseline 与引用
