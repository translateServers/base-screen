# ADR-0029：宿主托管可信物料包分发

> 状态：已接受
> 日期：2026-08-11
> 依据：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)、[ADR-0084](./ADR-0084-plugin-contribution-vocabulary-and-trust.md)
> 关联：[ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md)、[ADR-0009](./ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)
> 规格：[Host Material Package Spec](../specs/archive/host-material-package/spec.md)
> 计划：[实施计划](../plans/archive/host-material-package/implementation-plan.md)

## 1. 背景

宿主需要复用由第三方或业务团队单独分发的物料包（内部制品、构建产物或受控加载的远程模块）。Base Screen 的物料
ABI 是同 realm Custom Element constructor + 实例级不可变 catalog（ADR-0003）；ADR-0004 要求远程发现、动态导入、
签名市场和不可信执行必须先有独立威胁模型 ADR；ADR-0009 已明确远程物料渲染不在远程插件协议内。当前缺少一条
权威边界，说明“远程物料包”中哪些由宿主负责、物料进入 Base Screen 后必须满足什么契约、Base Screen 提供哪些
注册辅助，避免宿主用私有 DOM 逃生口或文档驱动的代码加载绕开既有 ABI。

## 2. 决策

### 2.1 术语与归属

1. “远程物料包”指由宿主显式选择、加载并审核的可信外部物料模块。远程性只存在于宿主的分发与加载阶段；
   Base Screen 不感知物料代码来自本地依赖、内部制品还是远程 URL。
2. 加载、审核、完整性校验、缓存、更新与失败处理由宿主拥有（ADR-0027 宿主边界）。Base Screen 不 fetch、不
   dynamic import、不发现、不签名校验、不部署远程代码；ADR-0004 的信任模型不变。
3. 物料进入 Base Screen 后仍是同 realm 的普通 `BaseScreenMaterialConstructor`，遵守 ADR-0003 ABI：稳定
   `type`/`tagName`、显式 `define()`、实例级不可变 catalog。不引入第二条渲染 ABI，不改变 document 契约。

### 2.2 公共契约

1. `@base-screen/plugin-sdk` 提供 `createMaterialPackage()`：接受 `{ id, materials }`，创建期完成全部物料的
   manifest 解析、静态 manifest 一致性校验与数据集适配器校验（复用 `createMaterialDefinition`），并拒绝包内
   重复 `type` / 重复 `tagName`；创建过程不访问浏览器全局。
2. `define()` 显式注册包内所有 Custom Element，并返回 `BaseScreenMaterialCatalogEntry` 列表，供宿主一次性
   构建不可变 catalog。任一注册失败时返回带材料索引定位的稳定诊断；浏览器无法撤销已注册定义，原子性由
   “注册前完整校验 + 一次性 catalog 构建”保证（ADR-0003/0004 语义不变）。
3. package `id` 只用于宿主侧诊断与配置，不进入 ScreenDocument、manifest 或公共运行时状态。

### 2.3 身份与持久化

1. ScreenDocument 只持久化物料 `type`；模块 URL、包名、版本、来源与完整性信息是宿主分发配置，不得进入文档、
   manifest 或公共 API（ADR-0003、ADR-0018、ADR-0025）。
2. 版本与更新策略是宿主决策。更新物料包 = 宿主重新加载新模块并重建实例 catalog；宿主必须先 `unload()` 或
   销毁旧实例，再配置新实例。

### 2.4 信任与失败边界

1. 首期信任模型仍是宿主显式选择、同 realm 的受信代码。Shadow DOM、manifest 校验与 catalog 不是安全沙箱
   （ADR-0004、ADR-0027）。
2. 不可信远程物料渲染（iframe/声明式 ABI）、签名市场与动态模块发现不在本期范围；实施前必须先有独立威胁模型
   ADR。
3. 宿主加载失败、校验失败或 catalog 不完整时由宿主中止初始化并展示宿主侧错误；Base Screen 不实现业务降级。

### 2.5 包边界

1. 不新增第十三个核心 package；外部物料包不属于本仓库固定包图（ADR-0001）。
2. 外部包只消费 `@base-screen/plugin-core`、`@base-screen/plugin-sdk` 及公开 bridge API，禁止 deep import
   Base Screen 源码、Engine 私有 DOM 或宿主 Store。

## 3. 排除方案

- 在 Base Screen 内置远程加载器或通用网络客户端：拒绝，属于宿主重型处理（ADR-0027）。
- 由 document、URL 或 npm 名称驱动模块加载：拒绝，文档不得选择可执行代码（ADR-0003、ADR-0004）。
- 用 iframe 渲染不可信远程物料：延后，需要 capability 专属 ADR（ADR-0009）。
- 为远程物料新增第二套渲染 ABI：拒绝，破坏 framework-neutral ABI（ADR-0003）。

## 4. 后果与回退

- plugin-sdk 拥有 `createMaterialPackage` 注册辅助；plugin-core、renderer、engine、contracts 与文档契约无改动。
- 浏览器 harness 提供宿主加载 → define → catalog → Viewer 渲染闭环演示与验证。
- 未来若需要不可信远程物料，以新 ADR 取代本决策，并按 ADR-0004 先完成威胁模型。

## 5. 确认记录

2026-08-11 用户批准“可信远程包”方向：宿主自行加载并校验远程物料包，再把 manifest/constructor/catalog 注入
Base Screen；Base Screen 不承担网络加载。本 ADR 自即日接受，Host Material Package Spec 同步生效。
