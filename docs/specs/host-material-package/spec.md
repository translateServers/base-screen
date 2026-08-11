# Host Material Package Spec

> 状态：生效中
> 最近更新：2026-08-11
> 定位：宿主托管可信物料包的分发、注册与目录集成契约
> 依据：[ADR-0029](../../decisions/ADR-0029-host-managed-material-package-distribution.md)、[ADR-0003](../../decisions/ADR-0003-web-component-material-abi-and-registration.md)、[ADR-0004](../../decisions/ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 1. 目标

为宿主接入“远程分发的可信物料包”定义最小公共契约与验证路径：宿主负责加载与信任，Base Screen 提供注册辅助
与目录集成，文档契约与渲染 ABI 保持不变。

## 2. 不变边界

- Base Screen 不 fetch、不 dynamic import、不发现、不签名校验远程代码；加载与信任完全由宿主拥有。
- 文档只持久化物料 `type`；URL、包名、版本与完整性信息不得进入文档、manifest 或公共 API。
- 物料进入 Base Screen 后仍是同 realm 的 `BaseScreenMaterialConstructor`，遵守 ADR-0003 ABI。
- 不新增第十三个核心 package；contracts、renderer、engine 的公共契约无改动。
- 不可信远程物料渲染（iframe/声明式 ABI）不在本 Spec 范围。

## 3. Requirements

### R1：`createMaterialPackage` 契约（plugin-sdk）

`createMaterialPackage(options)` SHALL：

- 接受 `{ id, materials: readonly CreateMaterialDefinitionOptions[] }`；`id` 为合法 ASCII identifier（同 plugin id
  语法，1..128 code units，仅 `[A-Za-z0-9._:-]`，首字符为字母或数字）；`materials` 为数组且最多 512 项。
- 创建期复用 `createMaterialDefinition` 完成每个物料的 manifest 解析、静态 manifest 一致性校验与数据集适配器
  校验，并拒绝包内重复 `type` / 重复 `tagName`；创建过程 SHALL 不访问浏览器全局，SHALL 以 `ScreenParseResult`
  fail closed（不抛异常），包括非对象 package options、非数组 `materials` 与非对象 material entry。
- 返回 `BaseScreenMaterialPackage`：只读 `id`、只读 `materials`（`BaseScreenMaterialDefinition[]`）与 `define()`。
- `define()` SHALL 在注册前对全部 `tagName` 做冲突预检；任一冲突时整体失败且不产生任何注册副作用，返回带
  `['materials', index, 'tagName']` 定位的稳定诊断。预检通过后逐个显式注册并返回
  `readonly BaseScreenMaterialCatalogEntry[]`；预检通过后注册仍失败时返回定位诊断，该条目不进入结果。

### R2：包内校验与诊断

- 空 `materials`、超过 512 项、非数组 `materials`、非对象 package options / material entry、非法 `id`、非法
  manifest、静态 manifest 不一致、适配器非法、重复 `type`、重复 `tagName` SHALL 在创建期 fail closed，返回
  `PLUGIN_CORE_MANIFEST_NOT_OBJECT` / `PLUGIN_CORE_MANIFEST_FIELD_INVALID` / `PLUGIN_CORE_IDENTITY_INVALID` /
  `PLUGIN_CORE_IDENTITY_CONFLICT` 稳定诊断，且定位到 `['materials', index, ...]`、`['materials']` 或 `['id']`。
- 同 tagName 同 constructor 幂等；同 tagName 不同 constructor 在 `define()` 预检时整体失败，不产生部分注册
  副作用，诊断定位到 `['materials', index, 'tagName']`。
- 诊断排序与既有 Plugin Core/Manager 语义一致（先 path 后 code 后 message）。

### R3：宿主加载与目录集成

- 宿主 SHALL 自行加载并审核外部物料模块（构建期依赖、内部制品或受控运行时加载），显式调用 `define()`，再以
  返回的 entries 一次性构建不可变 catalog；Base Screen 不提供加载器。
- 宿主 SHALL 从自身配置决定允许的物料集合，不得依据文档内容动态加载模块。
- 更换物料集合时宿主 SHALL 先 `unload()` 或销毁旧实例，再以新 catalog 重建实例；已初始化实例不得原地替换
  catalog。

### R4：身份与持久化

- ScreenDocument 只引用稳定物料 `type`；托管物料包同样遵守 type/tagName 稳定性与 manifest 静态一致性；
  package `id`、模块地址与版本不进入文档。

### R5：示例与验证

- browser-harness SHALL 提供模拟“宿主托管远程物料包”的独立示例模块：只声明 manifest/constructor 并复用
  `createMaterialPackage`，宿主入口加载、`define()` 并构造只含该包的 catalog 渲染一个 Viewer 文档，且不影响
  主 catalog 与既有断言。
- `pnpm verify:browser` SHALL 验证该示例的注册状态与渲染闭环（`BROWSER_HARNESS_HOSTED_PACKAGE_FAILED` 分支）。

## 4. 完成定义

- R1–R5 全部有自动化证据（plugin-sdk 包测试 + browser-harness 验证）。
- `tasks.md` 与 `checklist.md` 的全部适用项均已勾选，test-matrix 与当前证据双向映射。
- 受影响包质量门与 `pnpm verify:m0`（或 verify:fast + verify:browser）通过。
