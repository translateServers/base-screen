# 宿主托管物料包概论评估

> 状态：已评审并采纳
> 日期：2026-08-11
> 结论：采纳“宿主托管可信物料包”方向；已由 [ADR-0029](../../../decisions/ADR-0029-host-managed-material-package-distribution.md) 与 [Host Material Package Spec](../../../specs/archive/host-material-package/spec.md) 固化
> 关联：[实施计划](./implementation-plan.md)

## 1. 评估目标

宿主在真实使用中需要复用由第三方或业务团队远程分发的物料。本评估回答：是否新增一个“物料包”能力、新增在哪个
包/层、采用什么信任与加载模型、需要哪些契约与文档改动。

## 2. 现状基线（只读调研结论）

- 物料 ABI 是同 realm `BaseScreenMaterialConstructor` + 显式 `define()` + 实例级不可变 catalog
  （ADR-0003、`packages/plugin-core/src/contracts.ts`）；renderer 直接 `new catalog.get(type).constructor`
  （`packages/renderer/src/renderer.ts`）。
- `@base-screen/material` 只是官方物料实现包（`packages/material/src/index.ts`），不含任何加载逻辑。
- plugin-manager 只预检宿主已注册的 constructor（`packages/plugin-manager/src/registry.ts`），不从文档/网络
  加载代码（ADR-0004）；`remote-sandbox.ts` 存在但被排除出构建且不是公共 API。
- 已归档 Spec 与 ADR-0008/0009 明确：远程物料渲染不在远程插件协议内，未来需要 capability 专属 ADR。
- 文档契约禁止持久化 URL/模块地址/版本（ADR-0003、ADR-0018、ADR-0025）；固定 12 包，禁止新增第 13 个核心包
  （ADR-0001、ADR-0027）。

## 3. 候选方案

| 方案 | 描述 | 评估 |
| --- | --- | --- |
| A. material 包内置远程加载器 | 在 `@base-screen/material` 内实现 fetch/dynamic import/缓存/更新 | 拒绝：把宿主重型处理迁回 Base Screen，违反 ADR-0027；实现包变成运行时层 |
| B. 新增第 13 个核心 package（如 `material-remote`） | 新建 workspace 包承载远程加载 | 拒绝：破坏固定 12 包门禁；无法解决宿主的信任、传输、部署问题 |
| C. 宿主托管可信物料包（采纳） | 宿主自行加载并审核远程物料模块，Base Screen 提供 `createMaterialPackage` 注册辅助与目录集成 | 采纳：零网络进入 Base Screen；复用现有 ABI；公共面最小 |
| D. iframe 隔离渲染不可信远程物料 | 参照 remote sandbox 扩展渲染 ABI | 延后：需要独立威胁模型 ADR 与声明式渲染 ABI（ADR-0004/0009 前置条件） |

## 4. 关键决策点与结论

1. **语义**：用户确认“远程物料”= 宿主可控加载的可信远程包，不是 Base Screen 内隔离不可信代码。
2. **信任模型**：首期保持同 realm 受信代码；Shadow DOM/manifest/catalog 不是安全沙箱（ADR-0004）。
3. **归属**：加载、审核、完整性、缓存、更新、失败处理全部归宿主；Base Screen 只提供“注册辅助 + 目录集成”。
4. **身份**：文档只持久化 `type`；package id、URL、包名、版本为宿主分发配置，不进文档/manifest。
5. **更新语义**：更新物料包 = 宿主重载新模块 + 重建实例 catalog（先 unload 旧实例），不原地替换。
6. **公共面**：plugin-sdk 增加 `createMaterialPackage`（创建期完整校验 + 显式 define），返回
   `BaseScreenMaterialCatalogEntry[]` 供一次性建目录；无第二套渲染 ABI。

## 5. 风险与边界

- 浏览器无法撤销 Custom Element 注册：原子性由“注册前完整校验 + 一次性 catalog 构建”保证，冲突 fail closed。
- 同 realm 受信代码拥有页面环境权限：宿主承担代码信任与审核责任，文档必须明示。
- 不可信远程物料（iframe/声明式 ABI）、签名市场、动态模块发现不在本期范围；需先立威胁模型 ADR。

## 6. 落地结果

- `createMaterialPackage` 已实现并覆盖 23 个聚焦测试；browser-harness 提供宿主受控 `import()` 动态加载 →
  define → catalog → Viewer 渲染闭环演示，`verify:browser` 含内容渲染断言。
- ADR-0029 已接受；Host Material Package Spec 已归档（2026-08-12），tasks/checklist 全部勾选。
- 质量门：`verify:fast`、`verify:browser`、`verify:tarball` 全部通过；contracts/renderer/engine 与文档契约零改动。
